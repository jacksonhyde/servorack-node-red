module.exports = function(RED) {
    const WebSocket = require('ws');
    const {randomUUID} = require('crypto');
    function address(value) {
        if (typeof value !== 'string' || !value.trim()) throw new Error('Enter a rack address');
        const text=value.trim();
        let url;
        try { url=new URL(text.includes('://')?text:'ws://'+text); }
        catch(_) { throw new Error('Enter a valid rack address'); }
        if (url.protocol!=='ws:' || url.username || url.password || url.search || url.hash ||
            !['/','/servorack/control'].includes(url.pathname)) throw new Error('Use a rack address or ws://host/servorack/control');
        url.pathname='/servorack/control';
        return url.toString();
    }
    RED.nodes.registerType('servorack connection', function(config) {
        RED.nodes.createNode(this,config);
        const node=this, flow=node.context().flow;
        let active=null, retry=null, closed=false, target='', wanted=false, delay=500;
        function reset() {
            // Never carry movement or a learned sample across transport sessions.
            flow.set('wsClients',{});
            flow.set('wsMidiRun',null); flow.set('oxygenPending',{});
            flow.set('servoPositions',{}); flow.set('midiInFlight',{});
            flow.set('axisProfiles',{}); flow.set('axisArmPending',null);
            flow.set('oxygenLearn',null);
            if (flow.get('dashboardPending')) {
                flow.set('dashboardPending',null); flow.set('dashboardUnknown',true);
            }
        }
        function status(state,detail='') {
            const value={address:target,state,wanted,device:active && active.device || '',detail};
            flow.set('rackConnection',value);
            node.status({fill:state==='connected'?'green':state==='disconnected'?'grey':'yellow',
                shape:'dot',text:state+(detail?': '+detail:'')});
            node.send([null,{topic:'rack-status',payload:value}]);
        }
        function stop() {
            if (retry) { clearTimeout(retry); retry=null; }
            const old=active; active=null;
            if (old) {
                for (const timer of old.sends) clearTimeout(timer);
                old.sends.clear();
                old.socket.terminate();
            }
            reset();
        }
        function failed(connection,detail) {
            if (connection!==active || closed) return;
            stop();
            if (!wanted) { status('disconnected'); return; }
            status('reconnecting',detail);
            retry=setTimeout(()=>{retry=null;connect();},delay);
            delay=Math.min(delay*2,5000);
        }
        function connect() {
            if (closed || !wanted) return;
            reset(); status('connecting');
            let socket;
            try { socket=new WebSocket(target,{handshakeTimeout:2000,maxPayload:512,perMessageDeflate:false}); }
            catch(e) {
                // Preserve the same failure/backoff path for synchronous errors.
                const connection={socket:{terminate(){}},sends:new Set()}; active=connection;
                failed(connection,e.message); return;
            }
            const connection={socket,route:{type:'servorack',id:randomUUID()},token:null,device:'',
                opened:false,openedAt:0,lastState:0,sends:new Set()};
            active=connection;
            socket.on('open',()=>{
                if (active!==connection) return;
                connection.opened=true; connection.openedAt=Date.now();
                status('handshake');
            });
            socket.on('message',(data,isBinary)=>{
                if (active!==connection) return;
                // ws 7 emits strings for text; ws 8 also supplies isBinary.
                if (isBinary===true || (typeof data!=='string' && isBinary!==false)) {
                    failed(connection,'Non-text reply'); return;
                }
                let p;
                try { p=JSON.parse(data.toString()); } catch(_) { failed(connection,'Invalid reply'); return; }
                if (!p || p.v!==1 || !/^[0-9a-f]{32}$/.test(p.session || '')) {
                    failed(connection,'Invalid reply'); return;
                }
                if (p.type==='hello') {
                    if (!/^servorack-[0-9a-f]{12}$/.test(p.device || '')) { failed(connection,'Invalid rack identity'); return; }
                    // A lease can renew without closing its underlying socket.
                    // Replace the route as well as the token to reject queued messages.
                    reset(); connection.route={type:'servorack',id:randomUUID()};
                    connection.token=p.session; connection.device=p.device;
                    connection.lastState=Date.now();
                    status('handshake');
                } else {
                    if (!connection.token || p.session!==connection.token) return;
                    if (!['state','ack','profile'].includes(p.type)) return;
                    if (p.type==='state') {
                        connection.lastState=Date.now(); delay=500;
                        status(p.live===true?'connected':'handshake');
                    }
                }
                node.send([{_session:{...connection.route},payload:data.toString()},null]);
            });
            socket.on('error',e=>failed(connection,e.message));
            socket.on('close',()=>failed(connection,'Connection closed'));
        }
        node.on('input',(msg,send,done)=>{
            if (msg.topic==='rack-connect') {
                let next;
                try { next=address(msg.payload); }
                catch(e) {
                    node.warn(e.message);
                    node.send([null,{topic:'rack-error',_client:msg._client,payload:{message:e.message}}]);
                    if(done)done(); return;
                }
                stop(); target=next; wanted=true; delay=500;
                flow.set('rackAddress',target,'servorack');
                flow.set('rackAutoConnect',true,'servorack');
                connect();
                node.send([null,{topic:'rack-selected',_client:msg._client,payload:{address:target}}]);
            } else if (msg.topic==='rack-disconnect') {
                wanted=false; flow.set('rackAutoConnect',false,'servorack');
                stop(); status('disconnected');
                node.send([null,{topic:'rack-selected',_client:msg._client,payload:{address:target}}]);
            } else {
                const c=active;
                if (!c || !c.opened || !c.token || !msg._session ||
                    msg._session.type!==c.route.type || msg._session.id!==c.route.id) { if(done)done(); return; }
                let payload,p;
                try {
                    payload=Buffer.isBuffer(msg.payload)?msg.payload.toString():msg.payload;
                    p=JSON.parse(payload);
                } catch(_) { if(done)done(); return; }
                if (!p || p.v!==1 || p.session!==c.token || Buffer.byteLength(payload)>512 ||
                    !['hello','heartbeat','arm','disarm','midi','profile_get','profile_set'].includes(p.type)) {
                    if(done)done(); return;
                }
                // Never queue offline writes or let a blocked socket accumulate MIDI.
                if (c.socket.bufferedAmount>4096 || c.sends.size>=16) {
                    failed(c,'Send backlog'); if(done)done(); return;
                }
                const timer=setTimeout(()=>failed(c,'Send timeout'),100);
                c.sends.add(timer);
                try {
                    c.socket.send(payload,err=>{
                        clearTimeout(timer); c.sends.delete(timer);
                        if (err) failed(c,err.message);
                    });
                } catch(e) { clearTimeout(timer); c.sends.delete(timer); failed(c,e.message); }
            }
            if(done)done();
        });
        const health=setInterval(()=>{
            const c=active;
            if (!c || !c.opened) return;
            if (!c.token && Date.now()-c.openedAt>=2000) failed(c,'Handshake timeout');
            else if (c.token && Date.now()-c.lastState>=1000) failed(c,'Rack state timeout');
        },100);
        node.on('close',(removed,done)=>{
            closed=true; wanted=false; clearInterval(health); stop();
            if(done)done();
        });
        const saved=flow.get('rackAddress','servorack') || config.address;
        if (saved) {
            try { target=address(saved); } catch(e) { node.warn(e.message); }
        }
        wanted=!!target && flow.get('rackAutoConnect','servorack')!==false;
        if (wanted) {
            flow.set('rackAddress',target,'servorack');
            connect();
        } else { reset(); status('disconnected'); }
    });
};
