module.exports = {
    apps: [{
        name: "mineskin-discord",
        script: "dist/index.js",
        args: ["--color", "--time"],
        time: true,
        interpreter: "node@14.15.4",
        max_memory_restart: "100M"
    }]
}
