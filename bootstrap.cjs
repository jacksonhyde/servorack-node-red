const fs = require('node:fs');
const path = require('node:path');

function bootstrap(dataDir, defaultsDir, defaultSettings, flowOverride) {
    fs.mkdirSync(dataDir, {recursive:true});
    const settingsPath = path.join(dataDir, 'settings.js');
    if (!fs.existsSync(settingsPath)) fs.copyFileSync(defaultSettings, settingsPath, fs.constants.COPYFILE_EXCL);
    const settings = require(settingsPath);
    if (!settings.contextStorage?.servorack) {
        fs.appendFileSync(settingsPath, '\n' + fs.readFileSync(path.join(defaultsDir,'persistent-context.js'),'utf8'));
    }
    const flowFile = flowOverride || settings.flowFile || 'flows.json';
    if (typeof flowFile !== 'string') throw new Error('ServoRack requires a flow filename');
    const destination = path.resolve(dataDir, flowFile);
    if (!fs.existsSync(destination)) {
        fs.copyFileSync(path.join(defaultsDir,'flows.json'), destination, fs.constants.COPYFILE_EXCL);
        console.log('Installed initial ServoRack dashboard flow');
    }
}
module.exports = bootstrap;
if (require.main === module) {
    bootstrap('/data', '/opt/servorack', '/usr/src/node-red/node_modules/node-red/settings.js', process.env.FLOWS);
}
