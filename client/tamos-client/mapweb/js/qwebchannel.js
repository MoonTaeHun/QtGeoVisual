/****************************************************************************
** QWebChannel 공식 스크립트 (압축 버전)
****************************************************************************/
"use strict"; var QWebChannelMessageTypes = { signal: 1, propertyUpdate: 2, init: 3, idle: 4, debug: 5, invokeMethod: 6, connectToSignal: 7, disconnectFromSignal: 8, setProperty: 9, response: 10 }; var QWebChannel = function (transport, initCallback) {
    if (typeof transport !== "object" || typeof transport.send !== "function") { console.error("The QWebChannel transport object is invalid!"); return; }
    var channel = this; this.transport = transport; this.execCallbacks = {}; this.execId = 0; this.objects = {};
    this.send = function (data) { if (typeof data !== "string") { data = JSON.stringify(data); } channel.transport.send(data); };
    this.exec = function (data, callback) { if (callback) { var id = channel.execId++; channel.execCallbacks[id] = callback; data.id = id; } channel.send(data); };
    this.handleResponse = function (response) { if (response.id !== undefined) { var callback = channel.execCallbacks[response.id]; if (callback) { callback(response.data); delete channel.execCallbacks[response.id]; } } };
    this.handleSignal = function (message) { var object = channel.objects[message.object]; if (object) { object.signalEmitted(message.signal, message.args); } };
    this.handlePropertyUpdate = function (message) { var object = channel.objects[message.object]; if (object) { object.propertyUpdate(message.properties); } };
    this.transport.onmessage = function (message) {
        var data = message.data; if (typeof data === "string") { data = JSON.parse(data); }
        switch (data.type) {
            case QWebChannelMessageTypes.response: channel.handleResponse(data); break;
            case QWebChannelMessageTypes.signal: channel.handleSignal(data); break;
            case QWebChannelMessageTypes.propertyUpdate: channel.handlePropertyUpdate(data); break;
        }
    };
    channel.exec({ type: QWebChannelMessageTypes.init }, function (data) {
        for (var objectName in data) { var object = new QObject(objectName, data[objectName], channel); }
        if (initCallback) initCallback(channel);
    });
};
function QObject(name, data, channel) {
    this.name = name; this.channel = channel; this.properties = {}; this.signals = {}; this.methods = {};
    channel.objects[name] = this;
    this.signalEmitted = function (signalName, args) { var handlers = this.signals[signalName]; if (handlers) { for (var i = 0; i < handlers.length; i++) { handlers[i].apply(null, args); } } };
    this.propertyUpdate = function (properties) { for (var propertyName in properties) { this.properties[propertyName] = properties[propertyName]; } };
    var self = this;
    data.methods.forEach(function (method) { self[method[0]] = function () { var args = []; for (var i = 0; i < arguments.length; i++) { args.push(arguments[i]); } var callback = undefined; if (args.length > 0 && typeof args[args.length - 1] === "function") { callback = args.pop(); } self.channel.exec({ type: QWebChannelMessageTypes.invokeMethod, object: self.name, method: method[0], args: args }, callback); }; });
    data.properties.forEach(function (property) { Object.defineProperty(self, property[0], { get: function () { return self.properties[property[0]]; }, set: function (value) { self.properties[property[0]] = value; self.channel.exec({ type: QWebChannelMessageTypes.setProperty, object: self.name, property: property[0], value: value }); }, enumerable: true }); self.properties[property[0]] = property[1]; });
    data.signals.forEach(function (signal) { self.signals[signal[0]] = []; self[signal[0]] = { connect: function (handler) { self.signals[signal[0]].push(handler); self.channel.exec({ type: QWebChannelMessageTypes.connectToSignal, object: self.name, signal: signal[0] }); }, disconnect: function (handler) { var index = self.signals[signal[0]].indexOf(handler); if (index !== -1) { self.signals[signal[0]].splice(index, 1); if (self.signals[signal[0]].length === 0) { self.channel.exec({ type: QWebChannelMessageTypes.disconnectFromSignal, object: self.name, signal: signal[0] }); } } } }; });
}
