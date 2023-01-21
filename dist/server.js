(() => {
  "use strict";
  var n = {
    n: (e) => {
      var t = e && e.__esModule ? () => e.default : () => e;
      return n.d(t, { a: t }), t;
    },
    d: (e, t) => {
      for (var r in t)
        n.o(t, r) &&
          !n.o(e, r) &&
          Object.defineProperty(e, r, { enumerable: !0, get: t[r] });
    },
    o: (n, e) => Object.prototype.hasOwnProperty.call(n, e),
  };
  const e = require("net");
  var t = n.n(e);
  const r = require("crypto");
  var o,
    a = n.n(r);
  function i(n, e, t, r) {
    var o = Buffer.alloc(9);
    o.writeUInt8(e, 0),
      o.writeUInt32BE(t || 0, 0),
      o.writeUInt32BE((null == r ? void 0 : r.length) || 0, 5),
      n.write(Buffer.concat([o, r || Buffer.alloc(0)]));
  }
  ((o = {})[1] = "data"), (o[2] = "close"), (o[4] = "log");
  var l = 0,
    c = {},
    u = {},
    f = t().createServer(function (n) {
      var e = a().randomBytes(4).toString("hex");
      function t() {
        for (var n in (console.log("Worker disconnected: " + e),
        delete c[e],
        u[e]))
          u[e][n].destroy();
      }
      (c[e] = n),
        (u[e] = {}),
        console.log("Worker connected: " + e),
        (function (n, e) {
          i(n, 4, 0, e);
        })(n, Buffer.from("https://".concat(e, ".tunnel.unknownpgr.com"))),
        n.on("close", t),
        n.on("error", t);
      var r,
        o =
          ((r = Buffer.alloc(0)),
          function (n) {
            r = Buffer.concat([r, n]);
            for (var e = []; r.length >= 9; ) {
              var t = r.readUInt8(0),
                o = r.readUInt32BE(1),
                a = r.readUInt32BE(5);
              if (r.length < 9 + a) break;
              var i = r.subarray(9, 9 + a);
              (r = r.subarray(9 + a)), e.push({ type: t, id: o, data: i });
            }
            return e;
          });
      n.on("data", function (n) {
        for (var t = 0, r = o(n); t < r.length; t++) {
          var a = r[t],
            i = a.type,
            l = a.id,
            c = a.data;
          1 === i
            ? u[e] && u[e][l] && u[e][l].write(c)
            : 2 === i
            ? u[e] && u[e][l] && u[e][l].end()
            : 4 === i
            ? console.log(c.toString())
            : console.log("Unknown type: " + i);
        }
      });
    }),
    s = t().createServer(function (n) {
      return (
        (e = void 0),
        (t = void 0),
        (o = function () {
          var e, t;
          return (function (n, e) {
            var t,
              r,
              o,
              a,
              i = {
                label: 0,
                sent: function () {
                  if (1 & o[0]) throw o[1];
                  return o[1];
                },
                trys: [],
                ops: [],
              };
            return (
              (a = { next: l(0), throw: l(1), return: l(2) }),
              "function" == typeof Symbol &&
                (a[Symbol.iterator] = function () {
                  return this;
                }),
              a
            );
            function l(l) {
              return function (c) {
                return (function (l) {
                  if (t) throw new TypeError("Generator is already executing.");
                  for (; a && ((a = 0), l[0] && (i = 0)), i; )
                    try {
                      if (
                        ((t = 1),
                        r &&
                          (o =
                            2 & l[0]
                              ? r.return
                              : l[0]
                              ? r.throw || ((o = r.return) && o.call(r), 0)
                              : r.next) &&
                          !(o = o.call(r, l[1])).done)
                      )
                        return o;
                      switch (((r = 0), o && (l = [2 & l[0], o.value]), l[0])) {
                        case 0:
                        case 1:
                          o = l;
                          break;
                        case 4:
                          return i.label++, { value: l[1], done: !1 };
                        case 5:
                          i.label++, (r = l[1]), (l = [0]);
                          continue;
                        case 7:
                          (l = i.ops.pop()), i.trys.pop();
                          continue;
                        default:
                          if (
                            !(
                              (o =
                                (o = i.trys).length > 0 && o[o.length - 1]) ||
                              (6 !== l[0] && 2 !== l[0])
                            )
                          ) {
                            i = 0;
                            continue;
                          }
                          if (
                            3 === l[0] &&
                            (!o || (l[1] > o[0] && l[1] < o[3]))
                          ) {
                            i.label = l[1];
                            break;
                          }
                          if (6 === l[0] && i.label < o[1]) {
                            (i.label = o[1]), (o = l);
                            break;
                          }
                          if (o && i.label < o[2]) {
                            (i.label = o[2]), i.ops.push(l);
                            break;
                          }
                          o[2] && i.ops.pop(), i.trys.pop();
                          continue;
                      }
                      l = e.call(n, i);
                    } catch (n) {
                      (l = [6, n]), (r = 0);
                    } finally {
                      t = o = 0;
                    }
                  if (5 & l[0]) throw l[1];
                  return { value: l[0] ? l[1] : void 0, done: !0 };
                })([l, c]);
              };
            }
          })(this, function (r) {
            return (
              (e = null),
              (t = l++),
              n.on("data", function (r) {
                if (!e) {
                  if (
                    ((e = (function (n) {
                      var e = n
                        .toString()
                        .split("\n")
                        .map(function (n) {
                          return n.trim();
                        })
                        .slice(1)
                        .reduce(function (n, e) {
                          var t = e.split(": "),
                            r = t[0],
                            o = t[1];
                          return (n[r] = o), n;
                        }, {});
                      return e.Host && e.Host.includes(".")
                        ? e.Host.split(".")[0]
                        : null;
                    })(r)),
                    !e || !c[e])
                  )
                    return (
                      console.log("Bar Request"),
                      n.write("HTTP/1.1 400 Bad Request\r\n\r\n"),
                      void n.end()
                    );
                  u[e][t] = n;
                  var o = function () {
                    e && (c[e] && i(c[e], 2, t), delete u[e][t]);
                  };
                  n.on("close", o), n.on("error", o);
                }
                !(function (n, e, t) {
                  i(n, 1, e, t);
                })(c[e], t, r);
              }),
              [2]
            );
          });
        }),
        new ((r = void 0) || (r = Promise))(function (n, a) {
          function i(n) {
            try {
              c(o.next(n));
            } catch (n) {
              a(n);
            }
          }
          function l(n) {
            try {
              c(o.throw(n));
            } catch (n) {
              a(n);
            }
          }
          function c(e) {
            var t;
            e.done
              ? n(e.value)
              : ((t = e.value),
                t instanceof r
                  ? t
                  : new r(function (n) {
                      n(t);
                    })).then(i, l);
          }
          c((o = o.apply(e, t || [])).next());
        })
      );
      var e, t, r, o;
    });
  f.listen(81, function () {
    console.log("Client server listening on port 81");
  }),
    s.listen(80, function () {
      console.log("User server listening on port 80");
    });
})();
