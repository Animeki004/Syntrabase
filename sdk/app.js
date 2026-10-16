export class FirebaseApp {
    name;
    options;
    static instances = new Map();
    constructor(name, options) {
        this.name = name;
        this.options = options;
    }
    static initialize(options, name = '[DEFAULT]') {
        const app = new FirebaseApp(name, options);
        this.instances.set(name, app);
        return app;
    }
    static getInstance(name = '[DEFAULT]') {
        const app = this.instances.get(name);
        if (!app) {
            throw new Error(`FirebaseApp '${name}' has not been initialized. Call initializeApp() first.`);
        }
        return app;
    }
}
export function initializeApp(options, name) {
    return FirebaseApp.initialize(options, name);
}
export function getApp(name) {
    return FirebaseApp.getInstance(name);
}
//# sourceMappingURL=app.js.map