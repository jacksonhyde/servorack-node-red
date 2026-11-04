// Appended to <userDir>/settings.js by bootstrap.cjs. Preserve the existing
// default context store. __dirname resolves to the user directory this file
// ends up in (/data in the Docker image, any local userDir in native dev).
module.exports.contextStorage = module.exports.contextStorage || {
    default: "memoryOnly", memoryOnly: {module:"memory"}
};
module.exports.contextStorage.servorack = {
    module:"localfilesystem",
    config:{dir:__dirname,base:"servorack-context",flushInterval:0}
};
