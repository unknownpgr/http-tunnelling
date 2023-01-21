(() => {
  "use strict";
  var e = {
      563: (e, n, t) => {
        var r;
        t.r(n),
          t.d(n, {
            NUMBER_TO_TYPE: () => i,
            TYPE_CLOSE: () => a,
            TYPE_DATA: () => o,
            TYPE_LOG: () => c,
            getReader: () => d,
            sendClose: () => f,
            sendData: () => l,
            sendLog: () => s,
          });
        var o = 1,
          a = 2,
          c = 4,
          i = (((r = {})[o] = "data"), (r[a] = "close"), (r[c] = "log"), r);
        function u(e, n, t, r) {
          var o = Buffer.alloc(9);
          o.writeUInt8(n, 0),
            o.writeUInt32BE(t || 0, 0),
            o.writeUInt32BE((null == r ? void 0 : r.length) || 0, 5),
            e.write(Buffer.concat([o, r || Buffer.alloc(0)]));
        }
        function l(e, n, t) {
          u(e, o, n, t);
        }
        function s(e, n) {
          u(e, c, 0, n);
        }
        function f(e, n) {
          u(e, a, n);
        }
        function d() {
          var e = Buffer.alloc(0);
          return function (n) {
            e = Buffer.concat([e, n]);
            for (var t = []; e.length >= 9; ) {
              var r = e.readUInt8(0),
                o = e.readUInt32BE(1),
                a = e.readUInt32BE(5);
              if (e.length < 9 + a) break;
              var c = e.subarray(9, 9 + a);
              (e = e.subarray(9 + a)), t.push({ type: r, id: o, data: c });
            }
            return t;
          };
        }
      },
    },
    n = {};
  function t(r) {
    var o = n[r];
    if (void 0 !== o) return o.exports;
    var a = (n[r] = { exports: {} });
    return e[r](a, a.exports, t), a.exports;
  }
  (t.n = (e) => {
    var n = e && e.__esModule ? () => e.default : () => e;
    return t.d(n, { a: n }), n;
  }),
    (t.d = (e, n) => {
      for (var r in n)
        t.o(n, r) &&
          !t.o(e, r) &&
          Object.defineProperty(e, r, { enumerable: !0, get: n[r] });
    }),
    (t.o = (e, n) => Object.prototype.hasOwnProperty.call(e, n)),
    (t.r = (e) => {
      "undefined" != typeof Symbol &&
        Symbol.toStringTag &&
        Object.defineProperty(e, Symbol.toStringTag, { value: "Module" }),
        Object.defineProperty(e, "__esModule", { value: !0 });
    }),
    (() => {
      const e = require("net");
      var n = t.n(e),
        r = function (e, n) {
          var t,
            r,
            o,
            a,
            c = {
              label: 0,
              sent: function () {
                if (1 & o[0]) throw o[1];
                return o[1];
              },
              trys: [],
              ops: [],
            };
          return (
            (a = { next: i(0), throw: i(1), return: i(2) }),
            "function" == typeof Symbol &&
              (a[Symbol.iterator] = function () {
                return this;
              }),
            a
          );
          function i(i) {
            return function (u) {
              return (function (i) {
                if (t) throw new TypeError("Generator is already executing.");
                for (; a && ((a = 0), i[0] && (c = 0)), c; )
                  try {
                    if (
                      ((t = 1),
                      r &&
                        (o =
                          2 & i[0]
                            ? r.return
                            : i[0]
                            ? r.throw || ((o = r.return) && o.call(r), 0)
                            : r.next) &&
                        !(o = o.call(r, i[1])).done)
                    )
                      return o;
                    switch (((r = 0), o && (i = [2 & i[0], o.value]), i[0])) {
                      case 0:
                      case 1:
                        o = i;
                        break;
                      case 4:
                        return c.label++, { value: i[1], done: !1 };
                      case 5:
                        c.label++, (r = i[1]), (i = [0]);
                        continue;
                      case 7:
                        (i = c.ops.pop()), c.trys.pop();
                        continue;
                      default:
                        if (
                          !(
                            (o = (o = c.trys).length > 0 && o[o.length - 1]) ||
                            (6 !== i[0] && 2 !== i[0])
                          )
                        ) {
                          c = 0;
                          continue;
                        }
                        if (
                          3 === i[0] &&
                          (!o || (i[1] > o[0] && i[1] < o[3]))
                        ) {
                          c.label = i[1];
                          break;
                        }
                        if (6 === i[0] && c.label < o[1]) {
                          (c.label = o[1]), (o = i);
                          break;
                        }
                        if (o && c.label < o[2]) {
                          (c.label = o[2]), c.ops.push(i);
                          break;
                        }
                        o[2] && c.ops.pop(), c.trys.pop();
                        continue;
                    }
                    i = n.call(e, c);
                  } catch (e) {
                    (i = [6, e]), (r = 0);
                  } finally {
                    t = o = 0;
                  }
                if (5 & i[0]) throw i[1];
                return { value: i[0] ? i[1] : void 0, done: !0 };
              })([i, u]);
            };
          }
        },
        o = t(563),
        a = o.sendData,
        c = o.sendClose,
        i = o.getReader,
        u = o.TYPE_DATA,
        l = o.TYPE_CLOSE,
        s = o.TYPE_LOG,
        f = process.argv[2].split(":"),
        d = f[0],
        p = f[1],
        v = p ? parseInt(p) : 80,
        b = i(),
        y = {};
      !(function () {
        var e, t, o, i;
        (e = this),
          (t = void 0),
          (i = function () {
            var e;
            return r(this, function (t) {
              switch (t.label) {
                case 0:
                  (e = function () {
                    var e, t, o, i, f;
                    return r(this, function (r) {
                      switch (r.label) {
                        case 0:
                          console.log("Connecting to server"),
                            (e = n().createConnection(
                              81,
                              "tunnel.unknownpgr.com"
                            )),
                            (t = function (t) {
                              var r = n().createConnection(v, d, function () {
                                console.log("Connected to application");
                              });
                              r.on("data", function (n) {
                                a(e, t, n);
                              }),
                                r.on("close", function () {
                                  c(e, t), delete y[t];
                                }),
                                (y[t] = r);
                            }),
                            e.on("data", function (e) {
                              for (var n = 0, r = b(e); n < r.length; n++) {
                                var o = r[n],
                                  a = o.type,
                                  c = o.id,
                                  i = o.data;
                                a === u && (y[c] || t(c), y[c].write(i)),
                                  a === l && y[c] && (y[c].end(), delete y[c]),
                                  a === s && console.log(i.toString());
                              }
                            }),
                            (o = new Promise(function (n, t) {
                              e.on("close", n), e.on("error", t);
                            })),
                            (r.label = 1);
                        case 1:
                          return r.trys.push([1, 3, , 4]), [4, o];
                        case 2:
                          return r.sent(), [3, 4];
                        case 3:
                          return (i = r.sent()), console.error(i), [3, 4];
                        case 4:
                          for (f in (console.log("Disconnected from server"),
                          y))
                            y[f].destroy(), delete y[f];
                          return (
                            console.log("Waiting for 5 seconds"),
                            [
                              4,
                              new Promise(function (e) {
                                return setTimeout(e, 5e3);
                              }),
                            ]
                          );
                        case 5:
                          return r.sent(), [2];
                      }
                    });
                  }),
                    (t.label = 1);
                case 1:
                  return [5, e()];
                case 2:
                  return t.sent(), [3, 1];
                case 3:
                  return [2];
              }
            });
          }),
          new ((o = void 0) || (o = Promise))(function (n, r) {
            function a(e) {
              try {
                u(i.next(e));
              } catch (e) {
                r(e);
              }
            }
            function c(e) {
              try {
                u(i.throw(e));
              } catch (e) {
                r(e);
              }
            }
            function u(e) {
              var t;
              e.done
                ? n(e.value)
                : ((t = e.value),
                  t instanceof o
                    ? t
                    : new o(function (e) {
                        e(t);
                      })).then(a, c);
            }
            u((i = i.apply(e, t || [])).next());
          });
      })();
    })();
})();
