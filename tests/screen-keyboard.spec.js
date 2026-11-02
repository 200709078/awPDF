// drAW'daki denetimlerin kopyası: klavye servisi aynı, uyarlanan yalnız bu başlık.
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { test } from '@playwright/test'
import { ScreenKeyboardService } from '../electron/screen-keyboard'

const eta = "org.eta.virtualkeyboard";
const onboard = "org.onboard.Onboard";
const flush = () => new Promise((resolve) => setImmediate(resolve));
function deferred() {
    let resolve;
    return { promise: new Promise((done) => { resolve = done; }), resolve: (value) => resolve(value) };
}

function fixture({ platform = "linux", names = [eta], installed = [] } = {}) {
    const handlers = new Map();
    const calls = [];
    const launches = [];
    const stopped = [];
    const io = {
        async call(name, path, method, args = []) {
            calls.push({ name, path, method, args });
            if (method.endsWith(".ListNames")) return `([${names.map((name) => `'${name}'`).join(",")}],)`;
            if (method.endsWith(".NameHasOwner")) return `(${names.includes(args[0])},)`;
            return "()";
        },
        async launch(command) {
            launches.push(command);
            if (!installed.includes(command)) return null;
            names.push(command === "eta-keyboard" ? eta : onboard);
            return { stop: () => stopped.push(command) };
        },
        async wait() {}
    };
    const service = new ScreenKeyboardService(io, platform);
    service.register({ handle: (name, fn) => handlers.set(name, fn), on: (name, fn) => handlers.set(name, fn) });
    const window = Object.assign(new EventEmitter(), {
        visible: true, minimized: false, destroyed: false,
        isVisible() { return this.visible; },
        isMinimized() { return this.minimized; },
        isDestroyed() { return this.destroyed; },
        webContents: Object.assign(new EventEmitter(), { mainFrame: {} })
    });
    service.allowWindow(window);
    const event = { sender: window.webContents, senderFrame: window.webContents.mainFrame };
    return { io, window, event, names, calls, launches, stopped,
        show: (id = "editor-1", sender = event) => handlers.get("screen-keyboard:show")(sender, id),
        hide: (id = "editor-1", sender = event) => handlers.get("screen-keyboard:hide")(sender, id),
        shown: () => calls.filter((c) => c.method.endsWith(".showForce") || c.method.endsWith(".Show")),
        hidden: () => calls.filter((c) => c.method.endsWith(".hide") || c.method.endsWith(".Hide"))
    };
}

test("shows running ETA without toggling it or spawning another instance", async () => {
    const f = fixture();
    assert.equal(await f.show(), "shown");
    assert.equal(await f.show(), "shown");
    assert.deepEqual(f.launches, []);
    assert.deepEqual(f.shown()[0], { name: eta, path: "/VirtualKeyboard",
        method: `${eta}.showForce`, args: ["false"] });
    assert.equal(f.shown().length, 2);
    f.hide(); await flush();
    assert.equal(f.hidden().length, 1);
});

test("uses active Onboard before trying to launch installed ETA", async () => {
    const f = fixture({ names: [onboard], installed: ["eta-keyboard"] });
    assert.equal(await f.show(), "shown");
    assert.deepEqual(f.launches, []);
    assert.deepEqual(f.shown()[0], { name: onboard, path: "/org/onboard/Onboard/Keyboard",
        method: `${onboard}.Keyboard.Show`, args: [] });
});

test("starts installed ETA and waits for its service before showing", async () => {
    const f = fixture({ names: [], installed: ["eta-keyboard"] });
    assert.equal(await f.show(), "shown");
    assert.deepEqual(f.launches, ["eta-keyboard"]);
    assert(f.calls.find((c) => c.method.endsWith(".NameHasOwner")));
});

test("starts installed Onboard if ETA is absent", async () => {
    const f = fixture({ names: [], installed: ["onboard"] });
    assert.equal(await f.show(), "shown");
    assert.deepEqual(f.launches, ["eta-keyboard", "onboard"]);
    assert.equal(f.shown().at(-1).name, onboard);
});

test("allows a newly started keyboard to export its object after taking its bus name", async () => {
    const f = fixture({ names: [], installed: ["onboard"] });
    const call = f.io.call;
    let attempts = 0;
    f.io.call = async (...args) => args[2].endsWith(".Show") && attempts++ < 2 ? null : call(...args);
    assert.equal(await f.show(), "shown");
    assert.equal(attempts, 3);
});

test("reports unavailable when neither keyboard is installed", async () => {
    const f = fixture({ names: [] });
    assert.equal(await f.show(), "unavailable");
    assert.equal(f.shown().length, 0);
});

test("missing or unresponsive D-Bus does not launch an uncontrolled keyboard", async () => {
    const f = fixture({ installed: ["eta-keyboard"] });
    f.io.call = async () => null;
    assert.equal(await f.show(), "unavailable");
    assert.deepEqual(f.launches, []);
});

test("process startup without a usable service is not reported as success or followed by another launch", async () => {
    const f = fixture({ names: [] });
    let launches = 0;
    let stopped = 0;
    f.io.launch = async () => { launches++; return { stop: () => stopped++ }; };
    assert.equal(await f.show(), "unavailable");
    assert.equal(launches, 1);
    assert.equal(f.shown().length, 0);
    assert.equal(stopped, 1, "an uncontrolled process could open after the request failed");
});

test("an immediate tool change cancels before any keyboard work", async () => {
    const f = fixture();
    const pending = f.show(); f.hide();
    assert.equal(await pending, "cancelled");
    assert.deepEqual(f.calls, []);
});

test("cancel during startup hides the late keyboard without showing it", async () => {
    const f = fixture({ names: [], installed: ["eta-keyboard"] });
    const started = deferred();
    f.io.launch = async () => started.promise;
    const pending = f.show(); await flush();
    f.hide(); f.names.push(eta); started.resolve({ stop() { throw new Error("existing keyboard must not be killed"); } });
    assert.equal(await pending, "cancelled");
    assert.equal(f.shown().length, 0);
    assert.equal(f.hidden().length, 1);
});

test("cancel during a pending Show sends Hide after Show completes", async () => {
    const f = fixture();
    const reply = deferred();
    const call = f.io.call;
    f.io.call = async (...args) => {
        const result = await call(...args);
        return args[2].endsWith(".showForce") ? reply.promise : result;
    };
    const pending = f.show(); await flush(); f.hide(); reply.resolve("()");
    assert.equal(await pending, "cancelled"); await flush();
    assert.equal(f.hidden().length, 1);
    assert(f.calls.findIndex((c) => c.method.endsWith(".hide")) > f.calls.findIndex((c) => c.method.endsWith(".showForce")));
});

test("old close requests cannot hide the keyboard for a new editor", async () => {
    const f = fixture();
    assert.equal(await f.show("old"), "shown");
    f.hide("old");
    const next = f.show("new");
    f.hide("old");
    assert.equal(await next, "shown");
    assert.equal(f.hidden().length, 0);
    f.hide("new"); await flush();
    assert.equal(f.hidden().length, 1);
});

for (const event of ["hide", "minimize", "closed", "render-process-gone", "did-start-navigation"]) {
    test(`${event} cleans up the keyboard`, async () => {
        const f = fixture();
        await f.show();
        if (event === "did-start-navigation") f.window.webContents.emit(event, {}, "file:///new", false, true);
        else if (event === "render-process-gone") f.window.webContents.emit(event);
        else f.window.emit(event);
        await flush();
        assert.equal(f.hidden().length, 1);
    });
}

test("iframe navigation does not close the active editor's keyboard", async () => {
    const f = fixture();
    await f.show();
    f.window.webContents.emit("did-start-navigation", {}, "about:blank", false, false);
    await flush();
    assert.equal(f.hidden().length, 0);
});

test("only an allowed main frame can control the keyboard", async () => {
    const f = fixture();
    assert.equal(await f.show("editor", { ...f.event, senderFrame: {} }), "unavailable");
    assert.equal(await f.show("editor", { ...f.event, sender: {} }), "unavailable");
    assert.deepEqual(f.calls, []);
    await f.show();
    f.hide("editor-1", { ...f.event, senderFrame: {} }); await flush();
    assert.equal(f.hidden().length, 0);
});

test("rejects arbitrary command-like payloads and hidden or minimized windows", async () => {
    const f = fixture();
    for (const id of [null, {}, "", "/usr/bin/eta-keyboard", "a;echo x", "a".repeat(65)]) {
        assert.equal(await f.show(id), "unavailable");
    }
    f.window.visible = false;
    assert.equal(await f.show(), "unavailable");
    f.window.visible = true; f.window.minimized = true;
    assert.equal(await f.show(), "unavailable");
    assert.deepEqual(f.calls, []);
});

for (const platform of ["win32", "darwin"]) {
    test(`${platform} never runs Linux keyboard commands`, async () => {
        const f = fixture({ platform });
        assert.equal(await f.show(), "unavailable");
        assert.deepEqual(f.calls, []);
    });
}
