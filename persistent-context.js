// Append to /data/settings.js. Preserve the existing default context store.
module.exports.contextStorage = module.exports.contextStorage || {
    default: "memoryOnly", memoryOnly: {module:"memory"}
};
module.exports.contextStorage.servorack = {
    module:"localfilesystem",
    config:{dir:"/data",base:"servorack-context",flushInterval:0}
};
