// Runtime-selectable input using the same RtMidi binding as node-red-contrib-midi.
module.exports = function(RED) {
    const midi = require('midi');
    RED.nodes.registerType('servorack midi input', function(config) {
        RED.nodes.createNode(this, config);
        const node=this, flow=node.context().flow;
        // closePort() leaves the native ALSA client allocated; reuse both handles.
        let input=null, receiver=null, probe=null, generation=0, identity=null, ports=[], closed=false, receiverClosing=false;
        const stable = name => name.replace(/ \d+:\d+$/, '');
        let selected=flow.get('midiDevice','servorack') || '';
        function stop() {
            ++generation;
            if (input) {
                input.removeAllListeners('message');
                // node-midi uses uv_close(), which completes in libuv's close phase.
                // Reinitialising its embedded handle before then aborts the process.
                receiverClosing=true;
                try { input.closePort(); } catch (_) {}
                // Two check phases guarantee an intervening close phase, including
                // when stop() itself was called from a timer or an I/O callback.
                setImmediate(()=>setImmediate(()=>{receiverClosing=false;if(!closed)scan();}));
            }
            input=null; identity=null;
        }
        function revoke() {
            const live=flow.get('wsMidiSource')==='oxygen';
            flow.set('oxygenReady',false); flow.set('oxygenPending',{}); flow.set('oxygenLearn',null);
            if (live) { flow.set('wsMidiSource','monitor'); flow.set('wsHeartbeats',false); }
            node.send([null,{topic:'disarm'}]);
        }
        function scan() {
            if (closed) return;
            try {
                if (!probe) probe=new midi.input();
                const names=Array.from({length:probe.getPortCount()},(_,i)=>probe.getPortName(i));
                // Include every input; duplicate names retain their endpoint identity.
                ports=names.map((name,index)=>({name,index,key:names.filter(n=>stable(n)===stable(name)).length===1?stable(name):name}));
                const port=ports.find(p=>p.key===selected);
                if (input && (!port || port.name!==identity)) { revoke(); stop(); }
                if (!input && port && !receiverClosing) {
                    const next=receiver || (receiver=new midi.input());
                    const openedGeneration=generation;
                    try {
                        next.ignoreTypes(false,false,false);
                        next.on('message',(_,raw)=>{ if (!closed && input===next && generation===openedGeneration) node.send([{payload:raw.slice(1),midi:{raw:raw.slice()}},null]); });
                        input=next;
                        next.openPort(port.index); identity=port.name;
                        flow.set('wsMidiSource','oxygen'); flow.set('wsMidiRun',null);
                        flow.set('oxygenPending',{}); flow.set('wsHeartbeats',true);
                        node.send([null,{topic:'disarm'}]);
                    } catch(e) { stop(); throw e; }
                }
                flow.set('midiDevices',ports.map(p=>({title:p.name,value:p.key})));
                flow.set('midiSelected',selected);
                flow.set('oxygenReady',!!input); flow.set('oxygenNeedsRestart',false);
                node.status({fill:input?'green':'yellow',shape:'dot',text:input?identity:'Select a MIDI input'});
            } catch(e) { if(input) {revoke();stop();} flow.set('oxygenReady',false); node.status({fill:'red',shape:'ring',text:e.message}); }
        }
        node.on('input',(msg,send,done)=>{
            if(msg.topic==='midi-select') {
                const key=msg.payload;
                if(typeof key!=='string' || (key && !ports.some(p=>p.key===key))) { node.warn('MIDI input is no longer available'); if(done)done(); return; }
                // Disable routing synchronously before closing or opening any endpoint.
                revoke(); stop(); flow.set('wsMidiSource','monitor'); flow.set('wsMidiRun',null);
                selected=key; flow.set('midiDevice',selected,'servorack');
            }
            scan(); if(done)done();
        });
        const timer=setInterval(scan,250);
        node.on('close',()=>{closed=true;clearInterval(timer);revoke();stop();if(probe)try{probe.closePort();}catch(_){} });
        scan();
    });
};
