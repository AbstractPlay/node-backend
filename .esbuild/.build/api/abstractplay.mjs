var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined")
    return require.apply(this, arguments);
  throw new Error('Dynamic require of "' + x + '" is not supported');
});
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __commonJS = (cb, mod) => function __require2() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// node_modules/uuid/dist/esm-node/rng.js
import crypto from "crypto";
function rng() {
  if (poolPtr > rnds8Pool.length - 16) {
    crypto.randomFillSync(rnds8Pool);
    poolPtr = 0;
  }
  return rnds8Pool.slice(poolPtr, poolPtr += 16);
}
var rnds8Pool, poolPtr;
var init_rng = __esm({
  "node_modules/uuid/dist/esm-node/rng.js"() {
    rnds8Pool = new Uint8Array(256);
    poolPtr = rnds8Pool.length;
  }
});

// node_modules/uuid/dist/esm-node/regex.js
var regex_default;
var init_regex = __esm({
  "node_modules/uuid/dist/esm-node/regex.js"() {
    regex_default = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|00000000-0000-0000-0000-000000000000)$/i;
  }
});

// node_modules/uuid/dist/esm-node/validate.js
function validate(uuid) {
  return typeof uuid === "string" && regex_default.test(uuid);
}
var validate_default;
var init_validate = __esm({
  "node_modules/uuid/dist/esm-node/validate.js"() {
    init_regex();
    validate_default = validate;
  }
});

// node_modules/uuid/dist/esm-node/stringify.js
function stringify(arr, offset = 0) {
  const uuid = (byteToHex[arr[offset + 0]] + byteToHex[arr[offset + 1]] + byteToHex[arr[offset + 2]] + byteToHex[arr[offset + 3]] + "-" + byteToHex[arr[offset + 4]] + byteToHex[arr[offset + 5]] + "-" + byteToHex[arr[offset + 6]] + byteToHex[arr[offset + 7]] + "-" + byteToHex[arr[offset + 8]] + byteToHex[arr[offset + 9]] + "-" + byteToHex[arr[offset + 10]] + byteToHex[arr[offset + 11]] + byteToHex[arr[offset + 12]] + byteToHex[arr[offset + 13]] + byteToHex[arr[offset + 14]] + byteToHex[arr[offset + 15]]).toLowerCase();
  if (!validate_default(uuid)) {
    throw TypeError("Stringified UUID is invalid");
  }
  return uuid;
}
var byteToHex, stringify_default;
var init_stringify = __esm({
  "node_modules/uuid/dist/esm-node/stringify.js"() {
    init_validate();
    byteToHex = [];
    for (let i = 0; i < 256; ++i) {
      byteToHex.push((i + 256).toString(16).substr(1));
    }
    stringify_default = stringify;
  }
});

// node_modules/uuid/dist/esm-node/v4.js
function v4(options, buf, offset) {
  options = options || {};
  const rnds = options.random || (options.rng || rng)();
  rnds[6] = rnds[6] & 15 | 64;
  rnds[8] = rnds[8] & 63 | 128;
  if (buf) {
    offset = offset || 0;
    for (let i = 0; i < 16; ++i) {
      buf[offset + i] = rnds[i];
    }
    return buf;
  }
  return stringify_default(rnds);
}
var v4_default;
var init_v4 = __esm({
  "node_modules/uuid/dist/esm-node/v4.js"() {
    init_rng();
    init_stringify();
    v4_default = v4;
  }
});

// node_modules/uuid/dist/esm-node/index.js
var init_esm_node = __esm({
  "node_modules/uuid/dist/esm-node/index.js"() {
    init_v4();
  }
});

// node_modules/bn.js/lib/bn.js
var require_bn = __commonJS({
  "node_modules/bn.js/lib/bn.js"(exports, module) {
    (function(module2, exports2) {
      "use strict";
      function assert(val, msg) {
        if (!val)
          throw new Error(msg || "Assertion failed");
      }
      function inherits(ctor, superCtor) {
        ctor.super_ = superCtor;
        var TempCtor = function() {
        };
        TempCtor.prototype = superCtor.prototype;
        ctor.prototype = new TempCtor();
        ctor.prototype.constructor = ctor;
      }
      function BN(number, base, endian) {
        if (BN.isBN(number)) {
          return number;
        }
        this.negative = 0;
        this.words = null;
        this.length = 0;
        this.red = null;
        if (number !== null) {
          if (base === "le" || base === "be") {
            endian = base;
            base = 10;
          }
          this._init(number || 0, base || 10, endian || "be");
        }
      }
      if (typeof module2 === "object") {
        module2.exports = BN;
      } else {
        exports2.BN = BN;
      }
      BN.BN = BN;
      BN.wordSize = 26;
      var Buffer2;
      try {
        if (typeof window !== "undefined" && typeof window.Buffer !== "undefined") {
          Buffer2 = window.Buffer;
        } else {
          Buffer2 = __require("buffer").Buffer;
        }
      } catch (e) {
      }
      BN.isBN = function isBN(num) {
        if (num instanceof BN) {
          return true;
        }
        return num !== null && typeof num === "object" && num.constructor.wordSize === BN.wordSize && Array.isArray(num.words);
      };
      BN.max = function max(left, right) {
        if (left.cmp(right) > 0)
          return left;
        return right;
      };
      BN.min = function min(left, right) {
        if (left.cmp(right) < 0)
          return left;
        return right;
      };
      BN.prototype._init = function init2(number, base, endian) {
        if (typeof number === "number") {
          return this._initNumber(number, base, endian);
        }
        if (typeof number === "object") {
          return this._initArray(number, base, endian);
        }
        if (base === "hex") {
          base = 16;
        }
        assert(base === (base | 0) && base >= 2 && base <= 36);
        number = number.toString().replace(/\s+/g, "");
        var start = 0;
        if (number[0] === "-") {
          start++;
          this.negative = 1;
        }
        if (start < number.length) {
          if (base === 16) {
            this._parseHex(number, start, endian);
          } else {
            this._parseBase(number, base, start);
            if (endian === "le") {
              this._initArray(this.toArray(), base, endian);
            }
          }
        }
      };
      BN.prototype._initNumber = function _initNumber(number, base, endian) {
        if (number < 0) {
          this.negative = 1;
          number = -number;
        }
        if (number < 67108864) {
          this.words = [number & 67108863];
          this.length = 1;
        } else if (number < 4503599627370496) {
          this.words = [
            number & 67108863,
            number / 67108864 & 67108863
          ];
          this.length = 2;
        } else {
          assert(number < 9007199254740992);
          this.words = [
            number & 67108863,
            number / 67108864 & 67108863,
            1
          ];
          this.length = 3;
        }
        if (endian !== "le")
          return;
        this._initArray(this.toArray(), base, endian);
      };
      BN.prototype._initArray = function _initArray(number, base, endian) {
        assert(typeof number.length === "number");
        if (number.length <= 0) {
          this.words = [0];
          this.length = 1;
          return this;
        }
        this.length = Math.ceil(number.length / 3);
        this.words = new Array(this.length);
        for (var i = 0; i < this.length; i++) {
          this.words[i] = 0;
        }
        var j, w;
        var off = 0;
        if (endian === "be") {
          for (i = number.length - 1, j = 0; i >= 0; i -= 3) {
            w = number[i] | number[i - 1] << 8 | number[i - 2] << 16;
            this.words[j] |= w << off & 67108863;
            this.words[j + 1] = w >>> 26 - off & 67108863;
            off += 24;
            if (off >= 26) {
              off -= 26;
              j++;
            }
          }
        } else if (endian === "le") {
          for (i = 0, j = 0; i < number.length; i += 3) {
            w = number[i] | number[i + 1] << 8 | number[i + 2] << 16;
            this.words[j] |= w << off & 67108863;
            this.words[j + 1] = w >>> 26 - off & 67108863;
            off += 24;
            if (off >= 26) {
              off -= 26;
              j++;
            }
          }
        }
        return this.strip();
      };
      function parseHex4Bits(string, index) {
        var c = string.charCodeAt(index);
        if (c >= 65 && c <= 70) {
          return c - 55;
        } else if (c >= 97 && c <= 102) {
          return c - 87;
        } else {
          return c - 48 & 15;
        }
      }
      function parseHexByte(string, lowerBound, index) {
        var r = parseHex4Bits(string, index);
        if (index - 1 >= lowerBound) {
          r |= parseHex4Bits(string, index - 1) << 4;
        }
        return r;
      }
      BN.prototype._parseHex = function _parseHex(number, start, endian) {
        this.length = Math.ceil((number.length - start) / 6);
        this.words = new Array(this.length);
        for (var i = 0; i < this.length; i++) {
          this.words[i] = 0;
        }
        var off = 0;
        var j = 0;
        var w;
        if (endian === "be") {
          for (i = number.length - 1; i >= start; i -= 2) {
            w = parseHexByte(number, start, i) << off;
            this.words[j] |= w & 67108863;
            if (off >= 18) {
              off -= 18;
              j += 1;
              this.words[j] |= w >>> 26;
            } else {
              off += 8;
            }
          }
        } else {
          var parseLength = number.length - start;
          for (i = parseLength % 2 === 0 ? start + 1 : start; i < number.length; i += 2) {
            w = parseHexByte(number, start, i) << off;
            this.words[j] |= w & 67108863;
            if (off >= 18) {
              off -= 18;
              j += 1;
              this.words[j] |= w >>> 26;
            } else {
              off += 8;
            }
          }
        }
        this.strip();
      };
      function parseBase(str, start, end, mul) {
        var r = 0;
        var len = Math.min(str.length, end);
        for (var i = start; i < len; i++) {
          var c = str.charCodeAt(i) - 48;
          r *= mul;
          if (c >= 49) {
            r += c - 49 + 10;
          } else if (c >= 17) {
            r += c - 17 + 10;
          } else {
            r += c;
          }
        }
        return r;
      }
      BN.prototype._parseBase = function _parseBase(number, base, start) {
        this.words = [0];
        this.length = 1;
        for (var limbLen = 0, limbPow = 1; limbPow <= 67108863; limbPow *= base) {
          limbLen++;
        }
        limbLen--;
        limbPow = limbPow / base | 0;
        var total = number.length - start;
        var mod = total % limbLen;
        var end = Math.min(total, total - mod) + start;
        var word = 0;
        for (var i = start; i < end; i += limbLen) {
          word = parseBase(number, i, i + limbLen, base);
          this.imuln(limbPow);
          if (this.words[0] + word < 67108864) {
            this.words[0] += word;
          } else {
            this._iaddn(word);
          }
        }
        if (mod !== 0) {
          var pow = 1;
          word = parseBase(number, i, number.length, base);
          for (i = 0; i < mod; i++) {
            pow *= base;
          }
          this.imuln(pow);
          if (this.words[0] + word < 67108864) {
            this.words[0] += word;
          } else {
            this._iaddn(word);
          }
        }
        this.strip();
      };
      BN.prototype.copy = function copy2(dest) {
        dest.words = new Array(this.length);
        for (var i = 0; i < this.length; i++) {
          dest.words[i] = this.words[i];
        }
        dest.length = this.length;
        dest.negative = this.negative;
        dest.red = this.red;
      };
      BN.prototype.clone = function clone() {
        var r = new BN(null);
        this.copy(r);
        return r;
      };
      BN.prototype._expand = function _expand(size) {
        while (this.length < size) {
          this.words[this.length++] = 0;
        }
        return this;
      };
      BN.prototype.strip = function strip() {
        while (this.length > 1 && this.words[this.length - 1] === 0) {
          this.length--;
        }
        return this._normSign();
      };
      BN.prototype._normSign = function _normSign() {
        if (this.length === 1 && this.words[0] === 0) {
          this.negative = 0;
        }
        return this;
      };
      BN.prototype.inspect = function inspect() {
        return (this.red ? "<BN-R: " : "<BN: ") + this.toString(16) + ">";
      };
      var zeros = [
        "",
        "0",
        "00",
        "000",
        "0000",
        "00000",
        "000000",
        "0000000",
        "00000000",
        "000000000",
        "0000000000",
        "00000000000",
        "000000000000",
        "0000000000000",
        "00000000000000",
        "000000000000000",
        "0000000000000000",
        "00000000000000000",
        "000000000000000000",
        "0000000000000000000",
        "00000000000000000000",
        "000000000000000000000",
        "0000000000000000000000",
        "00000000000000000000000",
        "000000000000000000000000",
        "0000000000000000000000000"
      ];
      var groupSizes = [
        0,
        0,
        25,
        16,
        12,
        11,
        10,
        9,
        8,
        8,
        7,
        7,
        7,
        7,
        6,
        6,
        6,
        6,
        6,
        6,
        6,
        5,
        5,
        5,
        5,
        5,
        5,
        5,
        5,
        5,
        5,
        5,
        5,
        5,
        5,
        5,
        5
      ];
      var groupBases = [
        0,
        0,
        33554432,
        43046721,
        16777216,
        48828125,
        60466176,
        40353607,
        16777216,
        43046721,
        1e7,
        19487171,
        35831808,
        62748517,
        7529536,
        11390625,
        16777216,
        24137569,
        34012224,
        47045881,
        64e6,
        4084101,
        5153632,
        6436343,
        7962624,
        9765625,
        11881376,
        14348907,
        17210368,
        20511149,
        243e5,
        28629151,
        33554432,
        39135393,
        45435424,
        52521875,
        60466176
      ];
      BN.prototype.toString = function toString(base, padding) {
        base = base || 10;
        padding = padding | 0 || 1;
        var out;
        if (base === 16 || base === "hex") {
          out = "";
          var off = 0;
          var carry = 0;
          for (var i = 0; i < this.length; i++) {
            var w = this.words[i];
            var word = ((w << off | carry) & 16777215).toString(16);
            carry = w >>> 24 - off & 16777215;
            if (carry !== 0 || i !== this.length - 1) {
              out = zeros[6 - word.length] + word + out;
            } else {
              out = word + out;
            }
            off += 2;
            if (off >= 26) {
              off -= 26;
              i--;
            }
          }
          if (carry !== 0) {
            out = carry.toString(16) + out;
          }
          while (out.length % padding !== 0) {
            out = "0" + out;
          }
          if (this.negative !== 0) {
            out = "-" + out;
          }
          return out;
        }
        if (base === (base | 0) && base >= 2 && base <= 36) {
          var groupSize = groupSizes[base];
          var groupBase = groupBases[base];
          out = "";
          var c = this.clone();
          c.negative = 0;
          while (!c.isZero()) {
            var r = c.modn(groupBase).toString(base);
            c = c.idivn(groupBase);
            if (!c.isZero()) {
              out = zeros[groupSize - r.length] + r + out;
            } else {
              out = r + out;
            }
          }
          if (this.isZero()) {
            out = "0" + out;
          }
          while (out.length % padding !== 0) {
            out = "0" + out;
          }
          if (this.negative !== 0) {
            out = "-" + out;
          }
          return out;
        }
        assert(false, "Base should be between 2 and 36");
      };
      BN.prototype.toNumber = function toNumber() {
        var ret = this.words[0];
        if (this.length === 2) {
          ret += this.words[1] * 67108864;
        } else if (this.length === 3 && this.words[2] === 1) {
          ret += 4503599627370496 + this.words[1] * 67108864;
        } else if (this.length > 2) {
          assert(false, "Number can only safely store up to 53 bits");
        }
        return this.negative !== 0 ? -ret : ret;
      };
      BN.prototype.toJSON = function toJSON() {
        return this.toString(16);
      };
      BN.prototype.toBuffer = function toBuffer(endian, length) {
        assert(typeof Buffer2 !== "undefined");
        return this.toArrayLike(Buffer2, endian, length);
      };
      BN.prototype.toArray = function toArray(endian, length) {
        return this.toArrayLike(Array, endian, length);
      };
      BN.prototype.toArrayLike = function toArrayLike(ArrayType, endian, length) {
        var byteLength = this.byteLength();
        var reqLength = length || Math.max(1, byteLength);
        assert(byteLength <= reqLength, "byte array longer than desired length");
        assert(reqLength > 0, "Requested array length <= 0");
        this.strip();
        var littleEndian = endian === "le";
        var res = new ArrayType(reqLength);
        var b, i;
        var q = this.clone();
        if (!littleEndian) {
          for (i = 0; i < reqLength - byteLength; i++) {
            res[i] = 0;
          }
          for (i = 0; !q.isZero(); i++) {
            b = q.andln(255);
            q.iushrn(8);
            res[reqLength - i - 1] = b;
          }
        } else {
          for (i = 0; !q.isZero(); i++) {
            b = q.andln(255);
            q.iushrn(8);
            res[i] = b;
          }
          for (; i < reqLength; i++) {
            res[i] = 0;
          }
        }
        return res;
      };
      if (Math.clz32) {
        BN.prototype._countBits = function _countBits(w) {
          return 32 - Math.clz32(w);
        };
      } else {
        BN.prototype._countBits = function _countBits(w) {
          var t2 = w;
          var r = 0;
          if (t2 >= 4096) {
            r += 13;
            t2 >>>= 13;
          }
          if (t2 >= 64) {
            r += 7;
            t2 >>>= 7;
          }
          if (t2 >= 8) {
            r += 4;
            t2 >>>= 4;
          }
          if (t2 >= 2) {
            r += 2;
            t2 >>>= 2;
          }
          return r + t2;
        };
      }
      BN.prototype._zeroBits = function _zeroBits(w) {
        if (w === 0)
          return 26;
        var t2 = w;
        var r = 0;
        if ((t2 & 8191) === 0) {
          r += 13;
          t2 >>>= 13;
        }
        if ((t2 & 127) === 0) {
          r += 7;
          t2 >>>= 7;
        }
        if ((t2 & 15) === 0) {
          r += 4;
          t2 >>>= 4;
        }
        if ((t2 & 3) === 0) {
          r += 2;
          t2 >>>= 2;
        }
        if ((t2 & 1) === 0) {
          r++;
        }
        return r;
      };
      BN.prototype.bitLength = function bitLength() {
        var w = this.words[this.length - 1];
        var hi = this._countBits(w);
        return (this.length - 1) * 26 + hi;
      };
      function toBitArray(num) {
        var w = new Array(num.bitLength());
        for (var bit = 0; bit < w.length; bit++) {
          var off = bit / 26 | 0;
          var wbit = bit % 26;
          w[bit] = (num.words[off] & 1 << wbit) >>> wbit;
        }
        return w;
      }
      BN.prototype.zeroBits = function zeroBits() {
        if (this.isZero())
          return 0;
        var r = 0;
        for (var i = 0; i < this.length; i++) {
          var b = this._zeroBits(this.words[i]);
          r += b;
          if (b !== 26)
            break;
        }
        return r;
      };
      BN.prototype.byteLength = function byteLength() {
        return Math.ceil(this.bitLength() / 8);
      };
      BN.prototype.toTwos = function toTwos(width) {
        if (this.negative !== 0) {
          return this.abs().inotn(width).iaddn(1);
        }
        return this.clone();
      };
      BN.prototype.fromTwos = function fromTwos(width) {
        if (this.testn(width - 1)) {
          return this.notn(width).iaddn(1).ineg();
        }
        return this.clone();
      };
      BN.prototype.isNeg = function isNeg() {
        return this.negative !== 0;
      };
      BN.prototype.neg = function neg() {
        return this.clone().ineg();
      };
      BN.prototype.ineg = function ineg() {
        if (!this.isZero()) {
          this.negative ^= 1;
        }
        return this;
      };
      BN.prototype.iuor = function iuor(num) {
        while (this.length < num.length) {
          this.words[this.length++] = 0;
        }
        for (var i = 0; i < num.length; i++) {
          this.words[i] = this.words[i] | num.words[i];
        }
        return this.strip();
      };
      BN.prototype.ior = function ior(num) {
        assert((this.negative | num.negative) === 0);
        return this.iuor(num);
      };
      BN.prototype.or = function or(num) {
        if (this.length > num.length)
          return this.clone().ior(num);
        return num.clone().ior(this);
      };
      BN.prototype.uor = function uor(num) {
        if (this.length > num.length)
          return this.clone().iuor(num);
        return num.clone().iuor(this);
      };
      BN.prototype.iuand = function iuand(num) {
        var b;
        if (this.length > num.length) {
          b = num;
        } else {
          b = this;
        }
        for (var i = 0; i < b.length; i++) {
          this.words[i] = this.words[i] & num.words[i];
        }
        this.length = b.length;
        return this.strip();
      };
      BN.prototype.iand = function iand(num) {
        assert((this.negative | num.negative) === 0);
        return this.iuand(num);
      };
      BN.prototype.and = function and(num) {
        if (this.length > num.length)
          return this.clone().iand(num);
        return num.clone().iand(this);
      };
      BN.prototype.uand = function uand(num) {
        if (this.length > num.length)
          return this.clone().iuand(num);
        return num.clone().iuand(this);
      };
      BN.prototype.iuxor = function iuxor(num) {
        var a;
        var b;
        if (this.length > num.length) {
          a = this;
          b = num;
        } else {
          a = num;
          b = this;
        }
        for (var i = 0; i < b.length; i++) {
          this.words[i] = a.words[i] ^ b.words[i];
        }
        if (this !== a) {
          for (; i < a.length; i++) {
            this.words[i] = a.words[i];
          }
        }
        this.length = a.length;
        return this.strip();
      };
      BN.prototype.ixor = function ixor(num) {
        assert((this.negative | num.negative) === 0);
        return this.iuxor(num);
      };
      BN.prototype.xor = function xor(num) {
        if (this.length > num.length)
          return this.clone().ixor(num);
        return num.clone().ixor(this);
      };
      BN.prototype.uxor = function uxor(num) {
        if (this.length > num.length)
          return this.clone().iuxor(num);
        return num.clone().iuxor(this);
      };
      BN.prototype.inotn = function inotn(width) {
        assert(typeof width === "number" && width >= 0);
        var bytesNeeded = Math.ceil(width / 26) | 0;
        var bitsLeft = width % 26;
        this._expand(bytesNeeded);
        if (bitsLeft > 0) {
          bytesNeeded--;
        }
        for (var i = 0; i < bytesNeeded; i++) {
          this.words[i] = ~this.words[i] & 67108863;
        }
        if (bitsLeft > 0) {
          this.words[i] = ~this.words[i] & 67108863 >> 26 - bitsLeft;
        }
        return this.strip();
      };
      BN.prototype.notn = function notn(width) {
        return this.clone().inotn(width);
      };
      BN.prototype.setn = function setn(bit, val) {
        assert(typeof bit === "number" && bit >= 0);
        var off = bit / 26 | 0;
        var wbit = bit % 26;
        this._expand(off + 1);
        if (val) {
          this.words[off] = this.words[off] | 1 << wbit;
        } else {
          this.words[off] = this.words[off] & ~(1 << wbit);
        }
        return this.strip();
      };
      BN.prototype.iadd = function iadd(num) {
        var r;
        if (this.negative !== 0 && num.negative === 0) {
          this.negative = 0;
          r = this.isub(num);
          this.negative ^= 1;
          return this._normSign();
        } else if (this.negative === 0 && num.negative !== 0) {
          num.negative = 0;
          r = this.isub(num);
          num.negative = 1;
          return r._normSign();
        }
        var a, b;
        if (this.length > num.length) {
          a = this;
          b = num;
        } else {
          a = num;
          b = this;
        }
        var carry = 0;
        for (var i = 0; i < b.length; i++) {
          r = (a.words[i] | 0) + (b.words[i] | 0) + carry;
          this.words[i] = r & 67108863;
          carry = r >>> 26;
        }
        for (; carry !== 0 && i < a.length; i++) {
          r = (a.words[i] | 0) + carry;
          this.words[i] = r & 67108863;
          carry = r >>> 26;
        }
        this.length = a.length;
        if (carry !== 0) {
          this.words[this.length] = carry;
          this.length++;
        } else if (a !== this) {
          for (; i < a.length; i++) {
            this.words[i] = a.words[i];
          }
        }
        return this;
      };
      BN.prototype.add = function add(num) {
        var res;
        if (num.negative !== 0 && this.negative === 0) {
          num.negative = 0;
          res = this.sub(num);
          num.negative ^= 1;
          return res;
        } else if (num.negative === 0 && this.negative !== 0) {
          this.negative = 0;
          res = num.sub(this);
          this.negative = 1;
          return res;
        }
        if (this.length > num.length)
          return this.clone().iadd(num);
        return num.clone().iadd(this);
      };
      BN.prototype.isub = function isub(num) {
        if (num.negative !== 0) {
          num.negative = 0;
          var r = this.iadd(num);
          num.negative = 1;
          return r._normSign();
        } else if (this.negative !== 0) {
          this.negative = 0;
          this.iadd(num);
          this.negative = 1;
          return this._normSign();
        }
        var cmp = this.cmp(num);
        if (cmp === 0) {
          this.negative = 0;
          this.length = 1;
          this.words[0] = 0;
          return this;
        }
        var a, b;
        if (cmp > 0) {
          a = this;
          b = num;
        } else {
          a = num;
          b = this;
        }
        var carry = 0;
        for (var i = 0; i < b.length; i++) {
          r = (a.words[i] | 0) - (b.words[i] | 0) + carry;
          carry = r >> 26;
          this.words[i] = r & 67108863;
        }
        for (; carry !== 0 && i < a.length; i++) {
          r = (a.words[i] | 0) + carry;
          carry = r >> 26;
          this.words[i] = r & 67108863;
        }
        if (carry === 0 && i < a.length && a !== this) {
          for (; i < a.length; i++) {
            this.words[i] = a.words[i];
          }
        }
        this.length = Math.max(this.length, i);
        if (a !== this) {
          this.negative = 1;
        }
        return this.strip();
      };
      BN.prototype.sub = function sub(num) {
        return this.clone().isub(num);
      };
      function smallMulTo(self, num, out) {
        out.negative = num.negative ^ self.negative;
        var len = self.length + num.length | 0;
        out.length = len;
        len = len - 1 | 0;
        var a = self.words[0] | 0;
        var b = num.words[0] | 0;
        var r = a * b;
        var lo = r & 67108863;
        var carry = r / 67108864 | 0;
        out.words[0] = lo;
        for (var k = 1; k < len; k++) {
          var ncarry = carry >>> 26;
          var rword = carry & 67108863;
          var maxJ = Math.min(k, num.length - 1);
          for (var j = Math.max(0, k - self.length + 1); j <= maxJ; j++) {
            var i = k - j | 0;
            a = self.words[i] | 0;
            b = num.words[j] | 0;
            r = a * b + rword;
            ncarry += r / 67108864 | 0;
            rword = r & 67108863;
          }
          out.words[k] = rword | 0;
          carry = ncarry | 0;
        }
        if (carry !== 0) {
          out.words[k] = carry | 0;
        } else {
          out.length--;
        }
        return out.strip();
      }
      var comb10MulTo = function comb10MulTo2(self, num, out) {
        var a = self.words;
        var b = num.words;
        var o = out.words;
        var c = 0;
        var lo;
        var mid;
        var hi;
        var a0 = a[0] | 0;
        var al0 = a0 & 8191;
        var ah0 = a0 >>> 13;
        var a1 = a[1] | 0;
        var al1 = a1 & 8191;
        var ah1 = a1 >>> 13;
        var a2 = a[2] | 0;
        var al2 = a2 & 8191;
        var ah2 = a2 >>> 13;
        var a3 = a[3] | 0;
        var al3 = a3 & 8191;
        var ah3 = a3 >>> 13;
        var a4 = a[4] | 0;
        var al4 = a4 & 8191;
        var ah4 = a4 >>> 13;
        var a5 = a[5] | 0;
        var al5 = a5 & 8191;
        var ah5 = a5 >>> 13;
        var a6 = a[6] | 0;
        var al6 = a6 & 8191;
        var ah6 = a6 >>> 13;
        var a7 = a[7] | 0;
        var al7 = a7 & 8191;
        var ah7 = a7 >>> 13;
        var a8 = a[8] | 0;
        var al8 = a8 & 8191;
        var ah8 = a8 >>> 13;
        var a9 = a[9] | 0;
        var al9 = a9 & 8191;
        var ah9 = a9 >>> 13;
        var b0 = b[0] | 0;
        var bl0 = b0 & 8191;
        var bh0 = b0 >>> 13;
        var b1 = b[1] | 0;
        var bl1 = b1 & 8191;
        var bh1 = b1 >>> 13;
        var b2 = b[2] | 0;
        var bl2 = b2 & 8191;
        var bh2 = b2 >>> 13;
        var b3 = b[3] | 0;
        var bl3 = b3 & 8191;
        var bh3 = b3 >>> 13;
        var b4 = b[4] | 0;
        var bl4 = b4 & 8191;
        var bh4 = b4 >>> 13;
        var b5 = b[5] | 0;
        var bl5 = b5 & 8191;
        var bh5 = b5 >>> 13;
        var b6 = b[6] | 0;
        var bl6 = b6 & 8191;
        var bh6 = b6 >>> 13;
        var b7 = b[7] | 0;
        var bl7 = b7 & 8191;
        var bh7 = b7 >>> 13;
        var b8 = b[8] | 0;
        var bl8 = b8 & 8191;
        var bh8 = b8 >>> 13;
        var b9 = b[9] | 0;
        var bl9 = b9 & 8191;
        var bh9 = b9 >>> 13;
        out.negative = self.negative ^ num.negative;
        out.length = 19;
        lo = Math.imul(al0, bl0);
        mid = Math.imul(al0, bh0);
        mid = mid + Math.imul(ah0, bl0) | 0;
        hi = Math.imul(ah0, bh0);
        var w0 = (c + lo | 0) + ((mid & 8191) << 13) | 0;
        c = (hi + (mid >>> 13) | 0) + (w0 >>> 26) | 0;
        w0 &= 67108863;
        lo = Math.imul(al1, bl0);
        mid = Math.imul(al1, bh0);
        mid = mid + Math.imul(ah1, bl0) | 0;
        hi = Math.imul(ah1, bh0);
        lo = lo + Math.imul(al0, bl1) | 0;
        mid = mid + Math.imul(al0, bh1) | 0;
        mid = mid + Math.imul(ah0, bl1) | 0;
        hi = hi + Math.imul(ah0, bh1) | 0;
        var w1 = (c + lo | 0) + ((mid & 8191) << 13) | 0;
        c = (hi + (mid >>> 13) | 0) + (w1 >>> 26) | 0;
        w1 &= 67108863;
        lo = Math.imul(al2, bl0);
        mid = Math.imul(al2, bh0);
        mid = mid + Math.imul(ah2, bl0) | 0;
        hi = Math.imul(ah2, bh0);
        lo = lo + Math.imul(al1, bl1) | 0;
        mid = mid + Math.imul(al1, bh1) | 0;
        mid = mid + Math.imul(ah1, bl1) | 0;
        hi = hi + Math.imul(ah1, bh1) | 0;
        lo = lo + Math.imul(al0, bl2) | 0;
        mid = mid + Math.imul(al0, bh2) | 0;
        mid = mid + Math.imul(ah0, bl2) | 0;
        hi = hi + Math.imul(ah0, bh2) | 0;
        var w2 = (c + lo | 0) + ((mid & 8191) << 13) | 0;
        c = (hi + (mid >>> 13) | 0) + (w2 >>> 26) | 0;
        w2 &= 67108863;
        lo = Math.imul(al3, bl0);
        mid = Math.imul(al3, bh0);
        mid = mid + Math.imul(ah3, bl0) | 0;
        hi = Math.imul(ah3, bh0);
        lo = lo + Math.imul(al2, bl1) | 0;
        mid = mid + Math.imul(al2, bh1) | 0;
        mid = mid + Math.imul(ah2, bl1) | 0;
        hi = hi + Math.imul(ah2, bh1) | 0;
        lo = lo + Math.imul(al1, bl2) | 0;
        mid = mid + Math.imul(al1, bh2) | 0;
        mid = mid + Math.imul(ah1, bl2) | 0;
        hi = hi + Math.imul(ah1, bh2) | 0;
        lo = lo + Math.imul(al0, bl3) | 0;
        mid = mid + Math.imul(al0, bh3) | 0;
        mid = mid + Math.imul(ah0, bl3) | 0;
        hi = hi + Math.imul(ah0, bh3) | 0;
        var w3 = (c + lo | 0) + ((mid & 8191) << 13) | 0;
        c = (hi + (mid >>> 13) | 0) + (w3 >>> 26) | 0;
        w3 &= 67108863;
        lo = Math.imul(al4, bl0);
        mid = Math.imul(al4, bh0);
        mid = mid + Math.imul(ah4, bl0) | 0;
        hi = Math.imul(ah4, bh0);
        lo = lo + Math.imul(al3, bl1) | 0;
        mid = mid + Math.imul(al3, bh1) | 0;
        mid = mid + Math.imul(ah3, bl1) | 0;
        hi = hi + Math.imul(ah3, bh1) | 0;
        lo = lo + Math.imul(al2, bl2) | 0;
        mid = mid + Math.imul(al2, bh2) | 0;
        mid = mid + Math.imul(ah2, bl2) | 0;
        hi = hi + Math.imul(ah2, bh2) | 0;
        lo = lo + Math.imul(al1, bl3) | 0;
        mid = mid + Math.imul(al1, bh3) | 0;
        mid = mid + Math.imul(ah1, bl3) | 0;
        hi = hi + Math.imul(ah1, bh3) | 0;
        lo = lo + Math.imul(al0, bl4) | 0;
        mid = mid + Math.imul(al0, bh4) | 0;
        mid = mid + Math.imul(ah0, bl4) | 0;
        hi = hi + Math.imul(ah0, bh4) | 0;
        var w4 = (c + lo | 0) + ((mid & 8191) << 13) | 0;
        c = (hi + (mid >>> 13) | 0) + (w4 >>> 26) | 0;
        w4 &= 67108863;
        lo = Math.imul(al5, bl0);
        mid = Math.imul(al5, bh0);
        mid = mid + Math.imul(ah5, bl0) | 0;
        hi = Math.imul(ah5, bh0);
        lo = lo + Math.imul(al4, bl1) | 0;
        mid = mid + Math.imul(al4, bh1) | 0;
        mid = mid + Math.imul(ah4, bl1) | 0;
        hi = hi + Math.imul(ah4, bh1) | 0;
        lo = lo + Math.imul(al3, bl2) | 0;
        mid = mid + Math.imul(al3, bh2) | 0;
        mid = mid + Math.imul(ah3, bl2) | 0;
        hi = hi + Math.imul(ah3, bh2) | 0;
        lo = lo + Math.imul(al2, bl3) | 0;
        mid = mid + Math.imul(al2, bh3) | 0;
        mid = mid + Math.imul(ah2, bl3) | 0;
        hi = hi + Math.imul(ah2, bh3) | 0;
        lo = lo + Math.imul(al1, bl4) | 0;
        mid = mid + Math.imul(al1, bh4) | 0;
        mid = mid + Math.imul(ah1, bl4) | 0;
        hi = hi + Math.imul(ah1, bh4) | 0;
        lo = lo + Math.imul(al0, bl5) | 0;
        mid = mid + Math.imul(al0, bh5) | 0;
        mid = mid + Math.imul(ah0, bl5) | 0;
        hi = hi + Math.imul(ah0, bh5) | 0;
        var w5 = (c + lo | 0) + ((mid & 8191) << 13) | 0;
        c = (hi + (mid >>> 13) | 0) + (w5 >>> 26) | 0;
        w5 &= 67108863;
        lo = Math.imul(al6, bl0);
        mid = Math.imul(al6, bh0);
        mid = mid + Math.imul(ah6, bl0) | 0;
        hi = Math.imul(ah6, bh0);
        lo = lo + Math.imul(al5, bl1) | 0;
        mid = mid + Math.imul(al5, bh1) | 0;
        mid = mid + Math.imul(ah5, bl1) | 0;
        hi = hi + Math.imul(ah5, bh1) | 0;
        lo = lo + Math.imul(al4, bl2) | 0;
        mid = mid + Math.imul(al4, bh2) | 0;
        mid = mid + Math.imul(ah4, bl2) | 0;
        hi = hi + Math.imul(ah4, bh2) | 0;
        lo = lo + Math.imul(al3, bl3) | 0;
        mid = mid + Math.imul(al3, bh3) | 0;
        mid = mid + Math.imul(ah3, bl3) | 0;
        hi = hi + Math.imul(ah3, bh3) | 0;
        lo = lo + Math.imul(al2, bl4) | 0;
        mid = mid + Math.imul(al2, bh4) | 0;
        mid = mid + Math.imul(ah2, bl4) | 0;
        hi = hi + Math.imul(ah2, bh4) | 0;
        lo = lo + Math.imul(al1, bl5) | 0;
        mid = mid + Math.imul(al1, bh5) | 0;
        mid = mid + Math.imul(ah1, bl5) | 0;
        hi = hi + Math.imul(ah1, bh5) | 0;
        lo = lo + Math.imul(al0, bl6) | 0;
        mid = mid + Math.imul(al0, bh6) | 0;
        mid = mid + Math.imul(ah0, bl6) | 0;
        hi = hi + Math.imul(ah0, bh6) | 0;
        var w6 = (c + lo | 0) + ((mid & 8191) << 13) | 0;
        c = (hi + (mid >>> 13) | 0) + (w6 >>> 26) | 0;
        w6 &= 67108863;
        lo = Math.imul(al7, bl0);
        mid = Math.imul(al7, bh0);
        mid = mid + Math.imul(ah7, bl0) | 0;
        hi = Math.imul(ah7, bh0);
        lo = lo + Math.imul(al6, bl1) | 0;
        mid = mid + Math.imul(al6, bh1) | 0;
        mid = mid + Math.imul(ah6, bl1) | 0;
        hi = hi + Math.imul(ah6, bh1) | 0;
        lo = lo + Math.imul(al5, bl2) | 0;
        mid = mid + Math.imul(al5, bh2) | 0;
        mid = mid + Math.imul(ah5, bl2) | 0;
        hi = hi + Math.imul(ah5, bh2) | 0;
        lo = lo + Math.imul(al4, bl3) | 0;
        mid = mid + Math.imul(al4, bh3) | 0;
        mid = mid + Math.imul(ah4, bl3) | 0;
        hi = hi + Math.imul(ah4, bh3) | 0;
        lo = lo + Math.imul(al3, bl4) | 0;
        mid = mid + Math.imul(al3, bh4) | 0;
        mid = mid + Math.imul(ah3, bl4) | 0;
        hi = hi + Math.imul(ah3, bh4) | 0;
        lo = lo + Math.imul(al2, bl5) | 0;
        mid = mid + Math.imul(al2, bh5) | 0;
        mid = mid + Math.imul(ah2, bl5) | 0;
        hi = hi + Math.imul(ah2, bh5) | 0;
        lo = lo + Math.imul(al1, bl6) | 0;
        mid = mid + Math.imul(al1, bh6) | 0;
        mid = mid + Math.imul(ah1, bl6) | 0;
        hi = hi + Math.imul(ah1, bh6) | 0;
        lo = lo + Math.imul(al0, bl7) | 0;
        mid = mid + Math.imul(al0, bh7) | 0;
        mid = mid + Math.imul(ah0, bl7) | 0;
        hi = hi + Math.imul(ah0, bh7) | 0;
        var w7 = (c + lo | 0) + ((mid & 8191) << 13) | 0;
        c = (hi + (mid >>> 13) | 0) + (w7 >>> 26) | 0;
        w7 &= 67108863;
        lo = Math.imul(al8, bl0);
        mid = Math.imul(al8, bh0);
        mid = mid + Math.imul(ah8, bl0) | 0;
        hi = Math.imul(ah8, bh0);
        lo = lo + Math.imul(al7, bl1) | 0;
        mid = mid + Math.imul(al7, bh1) | 0;
        mid = mid + Math.imul(ah7, bl1) | 0;
        hi = hi + Math.imul(ah7, bh1) | 0;
        lo = lo + Math.imul(al6, bl2) | 0;
        mid = mid + Math.imul(al6, bh2) | 0;
        mid = mid + Math.imul(ah6, bl2) | 0;
        hi = hi + Math.imul(ah6, bh2) | 0;
        lo = lo + Math.imul(al5, bl3) | 0;
        mid = mid + Math.imul(al5, bh3) | 0;
        mid = mid + Math.imul(ah5, bl3) | 0;
        hi = hi + Math.imul(ah5, bh3) | 0;
        lo = lo + Math.imul(al4, bl4) | 0;
        mid = mid + Math.imul(al4, bh4) | 0;
        mid = mid + Math.imul(ah4, bl4) | 0;
        hi = hi + Math.imul(ah4, bh4) | 0;
        lo = lo + Math.imul(al3, bl5) | 0;
        mid = mid + Math.imul(al3, bh5) | 0;
        mid = mid + Math.imul(ah3, bl5) | 0;
        hi = hi + Math.imul(ah3, bh5) | 0;
        lo = lo + Math.imul(al2, bl6) | 0;
        mid = mid + Math.imul(al2, bh6) | 0;
        mid = mid + Math.imul(ah2, bl6) | 0;
        hi = hi + Math.imul(ah2, bh6) | 0;
        lo = lo + Math.imul(al1, bl7) | 0;
        mid = mid + Math.imul(al1, bh7) | 0;
        mid = mid + Math.imul(ah1, bl7) | 0;
        hi = hi + Math.imul(ah1, bh7) | 0;
        lo = lo + Math.imul(al0, bl8) | 0;
        mid = mid + Math.imul(al0, bh8) | 0;
        mid = mid + Math.imul(ah0, bl8) | 0;
        hi = hi + Math.imul(ah0, bh8) | 0;
        var w8 = (c + lo | 0) + ((mid & 8191) << 13) | 0;
        c = (hi + (mid >>> 13) | 0) + (w8 >>> 26) | 0;
        w8 &= 67108863;
        lo = Math.imul(al9, bl0);
        mid = Math.imul(al9, bh0);
        mid = mid + Math.imul(ah9, bl0) | 0;
        hi = Math.imul(ah9, bh0);
        lo = lo + Math.imul(al8, bl1) | 0;
        mid = mid + Math.imul(al8, bh1) | 0;
        mid = mid + Math.imul(ah8, bl1) | 0;
        hi = hi + Math.imul(ah8, bh1) | 0;
        lo = lo + Math.imul(al7, bl2) | 0;
        mid = mid + Math.imul(al7, bh2) | 0;
        mid = mid + Math.imul(ah7, bl2) | 0;
        hi = hi + Math.imul(ah7, bh2) | 0;
        lo = lo + Math.imul(al6, bl3) | 0;
        mid = mid + Math.imul(al6, bh3) | 0;
        mid = mid + Math.imul(ah6, bl3) | 0;
        hi = hi + Math.imul(ah6, bh3) | 0;
        lo = lo + Math.imul(al5, bl4) | 0;
        mid = mid + Math.imul(al5, bh4) | 0;
        mid = mid + Math.imul(ah5, bl4) | 0;
        hi = hi + Math.imul(ah5, bh4) | 0;
        lo = lo + Math.imul(al4, bl5) | 0;
        mid = mid + Math.imul(al4, bh5) | 0;
        mid = mid + Math.imul(ah4, bl5) | 0;
        hi = hi + Math.imul(ah4, bh5) | 0;
        lo = lo + Math.imul(al3, bl6) | 0;
        mid = mid + Math.imul(al3, bh6) | 0;
        mid = mid + Math.imul(ah3, bl6) | 0;
        hi = hi + Math.imul(ah3, bh6) | 0;
        lo = lo + Math.imul(al2, bl7) | 0;
        mid = mid + Math.imul(al2, bh7) | 0;
        mid = mid + Math.imul(ah2, bl7) | 0;
        hi = hi + Math.imul(ah2, bh7) | 0;
        lo = lo + Math.imul(al1, bl8) | 0;
        mid = mid + Math.imul(al1, bh8) | 0;
        mid = mid + Math.imul(ah1, bl8) | 0;
        hi = hi + Math.imul(ah1, bh8) | 0;
        lo = lo + Math.imul(al0, bl9) | 0;
        mid = mid + Math.imul(al0, bh9) | 0;
        mid = mid + Math.imul(ah0, bl9) | 0;
        hi = hi + Math.imul(ah0, bh9) | 0;
        var w9 = (c + lo | 0) + ((mid & 8191) << 13) | 0;
        c = (hi + (mid >>> 13) | 0) + (w9 >>> 26) | 0;
        w9 &= 67108863;
        lo = Math.imul(al9, bl1);
        mid = Math.imul(al9, bh1);
        mid = mid + Math.imul(ah9, bl1) | 0;
        hi = Math.imul(ah9, bh1);
        lo = lo + Math.imul(al8, bl2) | 0;
        mid = mid + Math.imul(al8, bh2) | 0;
        mid = mid + Math.imul(ah8, bl2) | 0;
        hi = hi + Math.imul(ah8, bh2) | 0;
        lo = lo + Math.imul(al7, bl3) | 0;
        mid = mid + Math.imul(al7, bh3) | 0;
        mid = mid + Math.imul(ah7, bl3) | 0;
        hi = hi + Math.imul(ah7, bh3) | 0;
        lo = lo + Math.imul(al6, bl4) | 0;
        mid = mid + Math.imul(al6, bh4) | 0;
        mid = mid + Math.imul(ah6, bl4) | 0;
        hi = hi + Math.imul(ah6, bh4) | 0;
        lo = lo + Math.imul(al5, bl5) | 0;
        mid = mid + Math.imul(al5, bh5) | 0;
        mid = mid + Math.imul(ah5, bl5) | 0;
        hi = hi + Math.imul(ah5, bh5) | 0;
        lo = lo + Math.imul(al4, bl6) | 0;
        mid = mid + Math.imul(al4, bh6) | 0;
        mid = mid + Math.imul(ah4, bl6) | 0;
        hi = hi + Math.imul(ah4, bh6) | 0;
        lo = lo + Math.imul(al3, bl7) | 0;
        mid = mid + Math.imul(al3, bh7) | 0;
        mid = mid + Math.imul(ah3, bl7) | 0;
        hi = hi + Math.imul(ah3, bh7) | 0;
        lo = lo + Math.imul(al2, bl8) | 0;
        mid = mid + Math.imul(al2, bh8) | 0;
        mid = mid + Math.imul(ah2, bl8) | 0;
        hi = hi + Math.imul(ah2, bh8) | 0;
        lo = lo + Math.imul(al1, bl9) | 0;
        mid = mid + Math.imul(al1, bh9) | 0;
        mid = mid + Math.imul(ah1, bl9) | 0;
        hi = hi + Math.imul(ah1, bh9) | 0;
        var w10 = (c + lo | 0) + ((mid & 8191) << 13) | 0;
        c = (hi + (mid >>> 13) | 0) + (w10 >>> 26) | 0;
        w10 &= 67108863;
        lo = Math.imul(al9, bl2);
        mid = Math.imul(al9, bh2);
        mid = mid + Math.imul(ah9, bl2) | 0;
        hi = Math.imul(ah9, bh2);
        lo = lo + Math.imul(al8, bl3) | 0;
        mid = mid + Math.imul(al8, bh3) | 0;
        mid = mid + Math.imul(ah8, bl3) | 0;
        hi = hi + Math.imul(ah8, bh3) | 0;
        lo = lo + Math.imul(al7, bl4) | 0;
        mid = mid + Math.imul(al7, bh4) | 0;
        mid = mid + Math.imul(ah7, bl4) | 0;
        hi = hi + Math.imul(ah7, bh4) | 0;
        lo = lo + Math.imul(al6, bl5) | 0;
        mid = mid + Math.imul(al6, bh5) | 0;
        mid = mid + Math.imul(ah6, bl5) | 0;
        hi = hi + Math.imul(ah6, bh5) | 0;
        lo = lo + Math.imul(al5, bl6) | 0;
        mid = mid + Math.imul(al5, bh6) | 0;
        mid = mid + Math.imul(ah5, bl6) | 0;
        hi = hi + Math.imul(ah5, bh6) | 0;
        lo = lo + Math.imul(al4, bl7) | 0;
        mid = mid + Math.imul(al4, bh7) | 0;
        mid = mid + Math.imul(ah4, bl7) | 0;
        hi = hi + Math.imul(ah4, bh7) | 0;
        lo = lo + Math.imul(al3, bl8) | 0;
        mid = mid + Math.imul(al3, bh8) | 0;
        mid = mid + Math.imul(ah3, bl8) | 0;
        hi = hi + Math.imul(ah3, bh8) | 0;
        lo = lo + Math.imul(al2, bl9) | 0;
        mid = mid + Math.imul(al2, bh9) | 0;
        mid = mid + Math.imul(ah2, bl9) | 0;
        hi = hi + Math.imul(ah2, bh9) | 0;
        var w11 = (c + lo | 0) + ((mid & 8191) << 13) | 0;
        c = (hi + (mid >>> 13) | 0) + (w11 >>> 26) | 0;
        w11 &= 67108863;
        lo = Math.imul(al9, bl3);
        mid = Math.imul(al9, bh3);
        mid = mid + Math.imul(ah9, bl3) | 0;
        hi = Math.imul(ah9, bh3);
        lo = lo + Math.imul(al8, bl4) | 0;
        mid = mid + Math.imul(al8, bh4) | 0;
        mid = mid + Math.imul(ah8, bl4) | 0;
        hi = hi + Math.imul(ah8, bh4) | 0;
        lo = lo + Math.imul(al7, bl5) | 0;
        mid = mid + Math.imul(al7, bh5) | 0;
        mid = mid + Math.imul(ah7, bl5) | 0;
        hi = hi + Math.imul(ah7, bh5) | 0;
        lo = lo + Math.imul(al6, bl6) | 0;
        mid = mid + Math.imul(al6, bh6) | 0;
        mid = mid + Math.imul(ah6, bl6) | 0;
        hi = hi + Math.imul(ah6, bh6) | 0;
        lo = lo + Math.imul(al5, bl7) | 0;
        mid = mid + Math.imul(al5, bh7) | 0;
        mid = mid + Math.imul(ah5, bl7) | 0;
        hi = hi + Math.imul(ah5, bh7) | 0;
        lo = lo + Math.imul(al4, bl8) | 0;
        mid = mid + Math.imul(al4, bh8) | 0;
        mid = mid + Math.imul(ah4, bl8) | 0;
        hi = hi + Math.imul(ah4, bh8) | 0;
        lo = lo + Math.imul(al3, bl9) | 0;
        mid = mid + Math.imul(al3, bh9) | 0;
        mid = mid + Math.imul(ah3, bl9) | 0;
        hi = hi + Math.imul(ah3, bh9) | 0;
        var w12 = (c + lo | 0) + ((mid & 8191) << 13) | 0;
        c = (hi + (mid >>> 13) | 0) + (w12 >>> 26) | 0;
        w12 &= 67108863;
        lo = Math.imul(al9, bl4);
        mid = Math.imul(al9, bh4);
        mid = mid + Math.imul(ah9, bl4) | 0;
        hi = Math.imul(ah9, bh4);
        lo = lo + Math.imul(al8, bl5) | 0;
        mid = mid + Math.imul(al8, bh5) | 0;
        mid = mid + Math.imul(ah8, bl5) | 0;
        hi = hi + Math.imul(ah8, bh5) | 0;
        lo = lo + Math.imul(al7, bl6) | 0;
        mid = mid + Math.imul(al7, bh6) | 0;
        mid = mid + Math.imul(ah7, bl6) | 0;
        hi = hi + Math.imul(ah7, bh6) | 0;
        lo = lo + Math.imul(al6, bl7) | 0;
        mid = mid + Math.imul(al6, bh7) | 0;
        mid = mid + Math.imul(ah6, bl7) | 0;
        hi = hi + Math.imul(ah6, bh7) | 0;
        lo = lo + Math.imul(al5, bl8) | 0;
        mid = mid + Math.imul(al5, bh8) | 0;
        mid = mid + Math.imul(ah5, bl8) | 0;
        hi = hi + Math.imul(ah5, bh8) | 0;
        lo = lo + Math.imul(al4, bl9) | 0;
        mid = mid + Math.imul(al4, bh9) | 0;
        mid = mid + Math.imul(ah4, bl9) | 0;
        hi = hi + Math.imul(ah4, bh9) | 0;
        var w13 = (c + lo | 0) + ((mid & 8191) << 13) | 0;
        c = (hi + (mid >>> 13) | 0) + (w13 >>> 26) | 0;
        w13 &= 67108863;
        lo = Math.imul(al9, bl5);
        mid = Math.imul(al9, bh5);
        mid = mid + Math.imul(ah9, bl5) | 0;
        hi = Math.imul(ah9, bh5);
        lo = lo + Math.imul(al8, bl6) | 0;
        mid = mid + Math.imul(al8, bh6) | 0;
        mid = mid + Math.imul(ah8, bl6) | 0;
        hi = hi + Math.imul(ah8, bh6) | 0;
        lo = lo + Math.imul(al7, bl7) | 0;
        mid = mid + Math.imul(al7, bh7) | 0;
        mid = mid + Math.imul(ah7, bl7) | 0;
        hi = hi + Math.imul(ah7, bh7) | 0;
        lo = lo + Math.imul(al6, bl8) | 0;
        mid = mid + Math.imul(al6, bh8) | 0;
        mid = mid + Math.imul(ah6, bl8) | 0;
        hi = hi + Math.imul(ah6, bh8) | 0;
        lo = lo + Math.imul(al5, bl9) | 0;
        mid = mid + Math.imul(al5, bh9) | 0;
        mid = mid + Math.imul(ah5, bl9) | 0;
        hi = hi + Math.imul(ah5, bh9) | 0;
        var w14 = (c + lo | 0) + ((mid & 8191) << 13) | 0;
        c = (hi + (mid >>> 13) | 0) + (w14 >>> 26) | 0;
        w14 &= 67108863;
        lo = Math.imul(al9, bl6);
        mid = Math.imul(al9, bh6);
        mid = mid + Math.imul(ah9, bl6) | 0;
        hi = Math.imul(ah9, bh6);
        lo = lo + Math.imul(al8, bl7) | 0;
        mid = mid + Math.imul(al8, bh7) | 0;
        mid = mid + Math.imul(ah8, bl7) | 0;
        hi = hi + Math.imul(ah8, bh7) | 0;
        lo = lo + Math.imul(al7, bl8) | 0;
        mid = mid + Math.imul(al7, bh8) | 0;
        mid = mid + Math.imul(ah7, bl8) | 0;
        hi = hi + Math.imul(ah7, bh8) | 0;
        lo = lo + Math.imul(al6, bl9) | 0;
        mid = mid + Math.imul(al6, bh9) | 0;
        mid = mid + Math.imul(ah6, bl9) | 0;
        hi = hi + Math.imul(ah6, bh9) | 0;
        var w15 = (c + lo | 0) + ((mid & 8191) << 13) | 0;
        c = (hi + (mid >>> 13) | 0) + (w15 >>> 26) | 0;
        w15 &= 67108863;
        lo = Math.imul(al9, bl7);
        mid = Math.imul(al9, bh7);
        mid = mid + Math.imul(ah9, bl7) | 0;
        hi = Math.imul(ah9, bh7);
        lo = lo + Math.imul(al8, bl8) | 0;
        mid = mid + Math.imul(al8, bh8) | 0;
        mid = mid + Math.imul(ah8, bl8) | 0;
        hi = hi + Math.imul(ah8, bh8) | 0;
        lo = lo + Math.imul(al7, bl9) | 0;
        mid = mid + Math.imul(al7, bh9) | 0;
        mid = mid + Math.imul(ah7, bl9) | 0;
        hi = hi + Math.imul(ah7, bh9) | 0;
        var w16 = (c + lo | 0) + ((mid & 8191) << 13) | 0;
        c = (hi + (mid >>> 13) | 0) + (w16 >>> 26) | 0;
        w16 &= 67108863;
        lo = Math.imul(al9, bl8);
        mid = Math.imul(al9, bh8);
        mid = mid + Math.imul(ah9, bl8) | 0;
        hi = Math.imul(ah9, bh8);
        lo = lo + Math.imul(al8, bl9) | 0;
        mid = mid + Math.imul(al8, bh9) | 0;
        mid = mid + Math.imul(ah8, bl9) | 0;
        hi = hi + Math.imul(ah8, bh9) | 0;
        var w17 = (c + lo | 0) + ((mid & 8191) << 13) | 0;
        c = (hi + (mid >>> 13) | 0) + (w17 >>> 26) | 0;
        w17 &= 67108863;
        lo = Math.imul(al9, bl9);
        mid = Math.imul(al9, bh9);
        mid = mid + Math.imul(ah9, bl9) | 0;
        hi = Math.imul(ah9, bh9);
        var w18 = (c + lo | 0) + ((mid & 8191) << 13) | 0;
        c = (hi + (mid >>> 13) | 0) + (w18 >>> 26) | 0;
        w18 &= 67108863;
        o[0] = w0;
        o[1] = w1;
        o[2] = w2;
        o[3] = w3;
        o[4] = w4;
        o[5] = w5;
        o[6] = w6;
        o[7] = w7;
        o[8] = w8;
        o[9] = w9;
        o[10] = w10;
        o[11] = w11;
        o[12] = w12;
        o[13] = w13;
        o[14] = w14;
        o[15] = w15;
        o[16] = w16;
        o[17] = w17;
        o[18] = w18;
        if (c !== 0) {
          o[19] = c;
          out.length++;
        }
        return out;
      };
      if (!Math.imul) {
        comb10MulTo = smallMulTo;
      }
      function bigMulTo(self, num, out) {
        out.negative = num.negative ^ self.negative;
        out.length = self.length + num.length;
        var carry = 0;
        var hncarry = 0;
        for (var k = 0; k < out.length - 1; k++) {
          var ncarry = hncarry;
          hncarry = 0;
          var rword = carry & 67108863;
          var maxJ = Math.min(k, num.length - 1);
          for (var j = Math.max(0, k - self.length + 1); j <= maxJ; j++) {
            var i = k - j;
            var a = self.words[i] | 0;
            var b = num.words[j] | 0;
            var r = a * b;
            var lo = r & 67108863;
            ncarry = ncarry + (r / 67108864 | 0) | 0;
            lo = lo + rword | 0;
            rword = lo & 67108863;
            ncarry = ncarry + (lo >>> 26) | 0;
            hncarry += ncarry >>> 26;
            ncarry &= 67108863;
          }
          out.words[k] = rword;
          carry = ncarry;
          ncarry = hncarry;
        }
        if (carry !== 0) {
          out.words[k] = carry;
        } else {
          out.length--;
        }
        return out.strip();
      }
      function jumboMulTo(self, num, out) {
        var fftm = new FFTM();
        return fftm.mulp(self, num, out);
      }
      BN.prototype.mulTo = function mulTo(num, out) {
        var res;
        var len = this.length + num.length;
        if (this.length === 10 && num.length === 10) {
          res = comb10MulTo(this, num, out);
        } else if (len < 63) {
          res = smallMulTo(this, num, out);
        } else if (len < 1024) {
          res = bigMulTo(this, num, out);
        } else {
          res = jumboMulTo(this, num, out);
        }
        return res;
      };
      function FFTM(x, y) {
        this.x = x;
        this.y = y;
      }
      FFTM.prototype.makeRBT = function makeRBT(N) {
        var t2 = new Array(N);
        var l = BN.prototype._countBits(N) - 1;
        for (var i = 0; i < N; i++) {
          t2[i] = this.revBin(i, l, N);
        }
        return t2;
      };
      FFTM.prototype.revBin = function revBin(x, l, N) {
        if (x === 0 || x === N - 1)
          return x;
        var rb = 0;
        for (var i = 0; i < l; i++) {
          rb |= (x & 1) << l - i - 1;
          x >>= 1;
        }
        return rb;
      };
      FFTM.prototype.permute = function permute(rbt, rws, iws, rtws, itws, N) {
        for (var i = 0; i < N; i++) {
          rtws[i] = rws[rbt[i]];
          itws[i] = iws[rbt[i]];
        }
      };
      FFTM.prototype.transform = function transform(rws, iws, rtws, itws, N, rbt) {
        this.permute(rbt, rws, iws, rtws, itws, N);
        for (var s = 1; s < N; s <<= 1) {
          var l = s << 1;
          var rtwdf = Math.cos(2 * Math.PI / l);
          var itwdf = Math.sin(2 * Math.PI / l);
          for (var p = 0; p < N; p += l) {
            var rtwdf_ = rtwdf;
            var itwdf_ = itwdf;
            for (var j = 0; j < s; j++) {
              var re = rtws[p + j];
              var ie = itws[p + j];
              var ro = rtws[p + j + s];
              var io = itws[p + j + s];
              var rx = rtwdf_ * ro - itwdf_ * io;
              io = rtwdf_ * io + itwdf_ * ro;
              ro = rx;
              rtws[p + j] = re + ro;
              itws[p + j] = ie + io;
              rtws[p + j + s] = re - ro;
              itws[p + j + s] = ie - io;
              if (j !== l) {
                rx = rtwdf * rtwdf_ - itwdf * itwdf_;
                itwdf_ = rtwdf * itwdf_ + itwdf * rtwdf_;
                rtwdf_ = rx;
              }
            }
          }
        }
      };
      FFTM.prototype.guessLen13b = function guessLen13b(n, m) {
        var N = Math.max(m, n) | 1;
        var odd = N & 1;
        var i = 0;
        for (N = N / 2 | 0; N; N = N >>> 1) {
          i++;
        }
        return 1 << i + 1 + odd;
      };
      FFTM.prototype.conjugate = function conjugate(rws, iws, N) {
        if (N <= 1)
          return;
        for (var i = 0; i < N / 2; i++) {
          var t2 = rws[i];
          rws[i] = rws[N - i - 1];
          rws[N - i - 1] = t2;
          t2 = iws[i];
          iws[i] = -iws[N - i - 1];
          iws[N - i - 1] = -t2;
        }
      };
      FFTM.prototype.normalize13b = function normalize13b(ws, N) {
        var carry = 0;
        for (var i = 0; i < N / 2; i++) {
          var w = Math.round(ws[2 * i + 1] / N) * 8192 + Math.round(ws[2 * i] / N) + carry;
          ws[i] = w & 67108863;
          if (w < 67108864) {
            carry = 0;
          } else {
            carry = w / 67108864 | 0;
          }
        }
        return ws;
      };
      FFTM.prototype.convert13b = function convert13b(ws, len, rws, N) {
        var carry = 0;
        for (var i = 0; i < len; i++) {
          carry = carry + (ws[i] | 0);
          rws[2 * i] = carry & 8191;
          carry = carry >>> 13;
          rws[2 * i + 1] = carry & 8191;
          carry = carry >>> 13;
        }
        for (i = 2 * len; i < N; ++i) {
          rws[i] = 0;
        }
        assert(carry === 0);
        assert((carry & ~8191) === 0);
      };
      FFTM.prototype.stub = function stub(N) {
        var ph = new Array(N);
        for (var i = 0; i < N; i++) {
          ph[i] = 0;
        }
        return ph;
      };
      FFTM.prototype.mulp = function mulp(x, y, out) {
        var N = 2 * this.guessLen13b(x.length, y.length);
        var rbt = this.makeRBT(N);
        var _23 = this.stub(N);
        var rws = new Array(N);
        var rwst = new Array(N);
        var iwst = new Array(N);
        var nrws = new Array(N);
        var nrwst = new Array(N);
        var niwst = new Array(N);
        var rmws = out.words;
        rmws.length = N;
        this.convert13b(x.words, x.length, rws, N);
        this.convert13b(y.words, y.length, nrws, N);
        this.transform(rws, _23, rwst, iwst, N, rbt);
        this.transform(nrws, _23, nrwst, niwst, N, rbt);
        for (var i = 0; i < N; i++) {
          var rx = rwst[i] * nrwst[i] - iwst[i] * niwst[i];
          iwst[i] = rwst[i] * niwst[i] + iwst[i] * nrwst[i];
          rwst[i] = rx;
        }
        this.conjugate(rwst, iwst, N);
        this.transform(rwst, iwst, rmws, _23, N, rbt);
        this.conjugate(rmws, _23, N);
        this.normalize13b(rmws, N);
        out.negative = x.negative ^ y.negative;
        out.length = x.length + y.length;
        return out.strip();
      };
      BN.prototype.mul = function mul(num) {
        var out = new BN(null);
        out.words = new Array(this.length + num.length);
        return this.mulTo(num, out);
      };
      BN.prototype.mulf = function mulf(num) {
        var out = new BN(null);
        out.words = new Array(this.length + num.length);
        return jumboMulTo(this, num, out);
      };
      BN.prototype.imul = function imul(num) {
        return this.clone().mulTo(num, this);
      };
      BN.prototype.imuln = function imuln(num) {
        assert(typeof num === "number");
        assert(num < 67108864);
        var carry = 0;
        for (var i = 0; i < this.length; i++) {
          var w = (this.words[i] | 0) * num;
          var lo = (w & 67108863) + (carry & 67108863);
          carry >>= 26;
          carry += w / 67108864 | 0;
          carry += lo >>> 26;
          this.words[i] = lo & 67108863;
        }
        if (carry !== 0) {
          this.words[i] = carry;
          this.length++;
        }
        return this;
      };
      BN.prototype.muln = function muln(num) {
        return this.clone().imuln(num);
      };
      BN.prototype.sqr = function sqr() {
        return this.mul(this);
      };
      BN.prototype.isqr = function isqr() {
        return this.imul(this.clone());
      };
      BN.prototype.pow = function pow(num) {
        var w = toBitArray(num);
        if (w.length === 0)
          return new BN(1);
        var res = this;
        for (var i = 0; i < w.length; i++, res = res.sqr()) {
          if (w[i] !== 0)
            break;
        }
        if (++i < w.length) {
          for (var q = res.sqr(); i < w.length; i++, q = q.sqr()) {
            if (w[i] === 0)
              continue;
            res = res.mul(q);
          }
        }
        return res;
      };
      BN.prototype.iushln = function iushln(bits) {
        assert(typeof bits === "number" && bits >= 0);
        var r = bits % 26;
        var s = (bits - r) / 26;
        var carryMask = 67108863 >>> 26 - r << 26 - r;
        var i;
        if (r !== 0) {
          var carry = 0;
          for (i = 0; i < this.length; i++) {
            var newCarry = this.words[i] & carryMask;
            var c = (this.words[i] | 0) - newCarry << r;
            this.words[i] = c | carry;
            carry = newCarry >>> 26 - r;
          }
          if (carry) {
            this.words[i] = carry;
            this.length++;
          }
        }
        if (s !== 0) {
          for (i = this.length - 1; i >= 0; i--) {
            this.words[i + s] = this.words[i];
          }
          for (i = 0; i < s; i++) {
            this.words[i] = 0;
          }
          this.length += s;
        }
        return this.strip();
      };
      BN.prototype.ishln = function ishln(bits) {
        assert(this.negative === 0);
        return this.iushln(bits);
      };
      BN.prototype.iushrn = function iushrn(bits, hint, extended) {
        assert(typeof bits === "number" && bits >= 0);
        var h;
        if (hint) {
          h = (hint - hint % 26) / 26;
        } else {
          h = 0;
        }
        var r = bits % 26;
        var s = Math.min((bits - r) / 26, this.length);
        var mask = 67108863 ^ 67108863 >>> r << r;
        var maskedWords = extended;
        h -= s;
        h = Math.max(0, h);
        if (maskedWords) {
          for (var i = 0; i < s; i++) {
            maskedWords.words[i] = this.words[i];
          }
          maskedWords.length = s;
        }
        if (s === 0) {
        } else if (this.length > s) {
          this.length -= s;
          for (i = 0; i < this.length; i++) {
            this.words[i] = this.words[i + s];
          }
        } else {
          this.words[0] = 0;
          this.length = 1;
        }
        var carry = 0;
        for (i = this.length - 1; i >= 0 && (carry !== 0 || i >= h); i--) {
          var word = this.words[i] | 0;
          this.words[i] = carry << 26 - r | word >>> r;
          carry = word & mask;
        }
        if (maskedWords && carry !== 0) {
          maskedWords.words[maskedWords.length++] = carry;
        }
        if (this.length === 0) {
          this.words[0] = 0;
          this.length = 1;
        }
        return this.strip();
      };
      BN.prototype.ishrn = function ishrn(bits, hint, extended) {
        assert(this.negative === 0);
        return this.iushrn(bits, hint, extended);
      };
      BN.prototype.shln = function shln(bits) {
        return this.clone().ishln(bits);
      };
      BN.prototype.ushln = function ushln(bits) {
        return this.clone().iushln(bits);
      };
      BN.prototype.shrn = function shrn(bits) {
        return this.clone().ishrn(bits);
      };
      BN.prototype.ushrn = function ushrn(bits) {
        return this.clone().iushrn(bits);
      };
      BN.prototype.testn = function testn(bit) {
        assert(typeof bit === "number" && bit >= 0);
        var r = bit % 26;
        var s = (bit - r) / 26;
        var q = 1 << r;
        if (this.length <= s)
          return false;
        var w = this.words[s];
        return !!(w & q);
      };
      BN.prototype.imaskn = function imaskn(bits) {
        assert(typeof bits === "number" && bits >= 0);
        var r = bits % 26;
        var s = (bits - r) / 26;
        assert(this.negative === 0, "imaskn works only with positive numbers");
        if (this.length <= s) {
          return this;
        }
        if (r !== 0) {
          s++;
        }
        this.length = Math.min(s, this.length);
        if (r !== 0) {
          var mask = 67108863 ^ 67108863 >>> r << r;
          this.words[this.length - 1] &= mask;
        }
        return this.strip();
      };
      BN.prototype.maskn = function maskn(bits) {
        return this.clone().imaskn(bits);
      };
      BN.prototype.iaddn = function iaddn(num) {
        assert(typeof num === "number");
        assert(num < 67108864);
        if (num < 0)
          return this.isubn(-num);
        if (this.negative !== 0) {
          if (this.length === 1 && (this.words[0] | 0) < num) {
            this.words[0] = num - (this.words[0] | 0);
            this.negative = 0;
            return this;
          }
          this.negative = 0;
          this.isubn(num);
          this.negative = 1;
          return this;
        }
        return this._iaddn(num);
      };
      BN.prototype._iaddn = function _iaddn(num) {
        this.words[0] += num;
        for (var i = 0; i < this.length && this.words[i] >= 67108864; i++) {
          this.words[i] -= 67108864;
          if (i === this.length - 1) {
            this.words[i + 1] = 1;
          } else {
            this.words[i + 1]++;
          }
        }
        this.length = Math.max(this.length, i + 1);
        return this;
      };
      BN.prototype.isubn = function isubn(num) {
        assert(typeof num === "number");
        assert(num < 67108864);
        if (num < 0)
          return this.iaddn(-num);
        if (this.negative !== 0) {
          this.negative = 0;
          this.iaddn(num);
          this.negative = 1;
          return this;
        }
        this.words[0] -= num;
        if (this.length === 1 && this.words[0] < 0) {
          this.words[0] = -this.words[0];
          this.negative = 1;
        } else {
          for (var i = 0; i < this.length && this.words[i] < 0; i++) {
            this.words[i] += 67108864;
            this.words[i + 1] -= 1;
          }
        }
        return this.strip();
      };
      BN.prototype.addn = function addn(num) {
        return this.clone().iaddn(num);
      };
      BN.prototype.subn = function subn(num) {
        return this.clone().isubn(num);
      };
      BN.prototype.iabs = function iabs() {
        this.negative = 0;
        return this;
      };
      BN.prototype.abs = function abs() {
        return this.clone().iabs();
      };
      BN.prototype._ishlnsubmul = function _ishlnsubmul(num, mul, shift) {
        var len = num.length + shift;
        var i;
        this._expand(len);
        var w;
        var carry = 0;
        for (i = 0; i < num.length; i++) {
          w = (this.words[i + shift] | 0) + carry;
          var right = (num.words[i] | 0) * mul;
          w -= right & 67108863;
          carry = (w >> 26) - (right / 67108864 | 0);
          this.words[i + shift] = w & 67108863;
        }
        for (; i < this.length - shift; i++) {
          w = (this.words[i + shift] | 0) + carry;
          carry = w >> 26;
          this.words[i + shift] = w & 67108863;
        }
        if (carry === 0)
          return this.strip();
        assert(carry === -1);
        carry = 0;
        for (i = 0; i < this.length; i++) {
          w = -(this.words[i] | 0) + carry;
          carry = w >> 26;
          this.words[i] = w & 67108863;
        }
        this.negative = 1;
        return this.strip();
      };
      BN.prototype._wordDiv = function _wordDiv(num, mode) {
        var shift = this.length - num.length;
        var a = this.clone();
        var b = num;
        var bhi = b.words[b.length - 1] | 0;
        var bhiBits = this._countBits(bhi);
        shift = 26 - bhiBits;
        if (shift !== 0) {
          b = b.ushln(shift);
          a.iushln(shift);
          bhi = b.words[b.length - 1] | 0;
        }
        var m = a.length - b.length;
        var q;
        if (mode !== "mod") {
          q = new BN(null);
          q.length = m + 1;
          q.words = new Array(q.length);
          for (var i = 0; i < q.length; i++) {
            q.words[i] = 0;
          }
        }
        var diff = a.clone()._ishlnsubmul(b, 1, m);
        if (diff.negative === 0) {
          a = diff;
          if (q) {
            q.words[m] = 1;
          }
        }
        for (var j = m - 1; j >= 0; j--) {
          var qj = (a.words[b.length + j] | 0) * 67108864 + (a.words[b.length + j - 1] | 0);
          qj = Math.min(qj / bhi | 0, 67108863);
          a._ishlnsubmul(b, qj, j);
          while (a.negative !== 0) {
            qj--;
            a.negative = 0;
            a._ishlnsubmul(b, 1, j);
            if (!a.isZero()) {
              a.negative ^= 1;
            }
          }
          if (q) {
            q.words[j] = qj;
          }
        }
        if (q) {
          q.strip();
        }
        a.strip();
        if (mode !== "div" && shift !== 0) {
          a.iushrn(shift);
        }
        return {
          div: q || null,
          mod: a
        };
      };
      BN.prototype.divmod = function divmod(num, mode, positive) {
        assert(!num.isZero());
        if (this.isZero()) {
          return {
            div: new BN(0),
            mod: new BN(0)
          };
        }
        var div, mod, res;
        if (this.negative !== 0 && num.negative === 0) {
          res = this.neg().divmod(num, mode);
          if (mode !== "mod") {
            div = res.div.neg();
          }
          if (mode !== "div") {
            mod = res.mod.neg();
            if (positive && mod.negative !== 0) {
              mod.iadd(num);
            }
          }
          return {
            div,
            mod
          };
        }
        if (this.negative === 0 && num.negative !== 0) {
          res = this.divmod(num.neg(), mode);
          if (mode !== "mod") {
            div = res.div.neg();
          }
          return {
            div,
            mod: res.mod
          };
        }
        if ((this.negative & num.negative) !== 0) {
          res = this.neg().divmod(num.neg(), mode);
          if (mode !== "div") {
            mod = res.mod.neg();
            if (positive && mod.negative !== 0) {
              mod.isub(num);
            }
          }
          return {
            div: res.div,
            mod
          };
        }
        if (num.length > this.length || this.cmp(num) < 0) {
          return {
            div: new BN(0),
            mod: this
          };
        }
        if (num.length === 1) {
          if (mode === "div") {
            return {
              div: this.divn(num.words[0]),
              mod: null
            };
          }
          if (mode === "mod") {
            return {
              div: null,
              mod: new BN(this.modn(num.words[0]))
            };
          }
          return {
            div: this.divn(num.words[0]),
            mod: new BN(this.modn(num.words[0]))
          };
        }
        return this._wordDiv(num, mode);
      };
      BN.prototype.div = function div(num) {
        return this.divmod(num, "div", false).div;
      };
      BN.prototype.mod = function mod(num) {
        return this.divmod(num, "mod", false).mod;
      };
      BN.prototype.umod = function umod(num) {
        return this.divmod(num, "mod", true).mod;
      };
      BN.prototype.divRound = function divRound(num) {
        var dm = this.divmod(num);
        if (dm.mod.isZero())
          return dm.div;
        var mod = dm.div.negative !== 0 ? dm.mod.isub(num) : dm.mod;
        var half = num.ushrn(1);
        var r2 = num.andln(1);
        var cmp = mod.cmp(half);
        if (cmp < 0 || r2 === 1 && cmp === 0)
          return dm.div;
        return dm.div.negative !== 0 ? dm.div.isubn(1) : dm.div.iaddn(1);
      };
      BN.prototype.modn = function modn(num) {
        assert(num <= 67108863);
        var p = (1 << 26) % num;
        var acc = 0;
        for (var i = this.length - 1; i >= 0; i--) {
          acc = (p * acc + (this.words[i] | 0)) % num;
        }
        return acc;
      };
      BN.prototype.idivn = function idivn(num) {
        assert(num <= 67108863);
        var carry = 0;
        for (var i = this.length - 1; i >= 0; i--) {
          var w = (this.words[i] | 0) + carry * 67108864;
          this.words[i] = w / num | 0;
          carry = w % num;
        }
        return this.strip();
      };
      BN.prototype.divn = function divn(num) {
        return this.clone().idivn(num);
      };
      BN.prototype.egcd = function egcd(p) {
        assert(p.negative === 0);
        assert(!p.isZero());
        var x = this;
        var y = p.clone();
        if (x.negative !== 0) {
          x = x.umod(p);
        } else {
          x = x.clone();
        }
        var A = new BN(1);
        var B = new BN(0);
        var C = new BN(0);
        var D = new BN(1);
        var g = 0;
        while (x.isEven() && y.isEven()) {
          x.iushrn(1);
          y.iushrn(1);
          ++g;
        }
        var yp = y.clone();
        var xp = x.clone();
        while (!x.isZero()) {
          for (var i = 0, im = 1; (x.words[0] & im) === 0 && i < 26; ++i, im <<= 1)
            ;
          if (i > 0) {
            x.iushrn(i);
            while (i-- > 0) {
              if (A.isOdd() || B.isOdd()) {
                A.iadd(yp);
                B.isub(xp);
              }
              A.iushrn(1);
              B.iushrn(1);
            }
          }
          for (var j = 0, jm = 1; (y.words[0] & jm) === 0 && j < 26; ++j, jm <<= 1)
            ;
          if (j > 0) {
            y.iushrn(j);
            while (j-- > 0) {
              if (C.isOdd() || D.isOdd()) {
                C.iadd(yp);
                D.isub(xp);
              }
              C.iushrn(1);
              D.iushrn(1);
            }
          }
          if (x.cmp(y) >= 0) {
            x.isub(y);
            A.isub(C);
            B.isub(D);
          } else {
            y.isub(x);
            C.isub(A);
            D.isub(B);
          }
        }
        return {
          a: C,
          b: D,
          gcd: y.iushln(g)
        };
      };
      BN.prototype._invmp = function _invmp(p) {
        assert(p.negative === 0);
        assert(!p.isZero());
        var a = this;
        var b = p.clone();
        if (a.negative !== 0) {
          a = a.umod(p);
        } else {
          a = a.clone();
        }
        var x1 = new BN(1);
        var x2 = new BN(0);
        var delta = b.clone();
        while (a.cmpn(1) > 0 && b.cmpn(1) > 0) {
          for (var i = 0, im = 1; (a.words[0] & im) === 0 && i < 26; ++i, im <<= 1)
            ;
          if (i > 0) {
            a.iushrn(i);
            while (i-- > 0) {
              if (x1.isOdd()) {
                x1.iadd(delta);
              }
              x1.iushrn(1);
            }
          }
          for (var j = 0, jm = 1; (b.words[0] & jm) === 0 && j < 26; ++j, jm <<= 1)
            ;
          if (j > 0) {
            b.iushrn(j);
            while (j-- > 0) {
              if (x2.isOdd()) {
                x2.iadd(delta);
              }
              x2.iushrn(1);
            }
          }
          if (a.cmp(b) >= 0) {
            a.isub(b);
            x1.isub(x2);
          } else {
            b.isub(a);
            x2.isub(x1);
          }
        }
        var res;
        if (a.cmpn(1) === 0) {
          res = x1;
        } else {
          res = x2;
        }
        if (res.cmpn(0) < 0) {
          res.iadd(p);
        }
        return res;
      };
      BN.prototype.gcd = function gcd(num) {
        if (this.isZero())
          return num.abs();
        if (num.isZero())
          return this.abs();
        var a = this.clone();
        var b = num.clone();
        a.negative = 0;
        b.negative = 0;
        for (var shift = 0; a.isEven() && b.isEven(); shift++) {
          a.iushrn(1);
          b.iushrn(1);
        }
        do {
          while (a.isEven()) {
            a.iushrn(1);
          }
          while (b.isEven()) {
            b.iushrn(1);
          }
          var r = a.cmp(b);
          if (r < 0) {
            var t2 = a;
            a = b;
            b = t2;
          } else if (r === 0 || b.cmpn(1) === 0) {
            break;
          }
          a.isub(b);
        } while (true);
        return b.iushln(shift);
      };
      BN.prototype.invm = function invm(num) {
        return this.egcd(num).a.umod(num);
      };
      BN.prototype.isEven = function isEven() {
        return (this.words[0] & 1) === 0;
      };
      BN.prototype.isOdd = function isOdd() {
        return (this.words[0] & 1) === 1;
      };
      BN.prototype.andln = function andln(num) {
        return this.words[0] & num;
      };
      BN.prototype.bincn = function bincn(bit) {
        assert(typeof bit === "number");
        var r = bit % 26;
        var s = (bit - r) / 26;
        var q = 1 << r;
        if (this.length <= s) {
          this._expand(s + 1);
          this.words[s] |= q;
          return this;
        }
        var carry = q;
        for (var i = s; carry !== 0 && i < this.length; i++) {
          var w = this.words[i] | 0;
          w += carry;
          carry = w >>> 26;
          w &= 67108863;
          this.words[i] = w;
        }
        if (carry !== 0) {
          this.words[i] = carry;
          this.length++;
        }
        return this;
      };
      BN.prototype.isZero = function isZero() {
        return this.length === 1 && this.words[0] === 0;
      };
      BN.prototype.cmpn = function cmpn(num) {
        var negative = num < 0;
        if (this.negative !== 0 && !negative)
          return -1;
        if (this.negative === 0 && negative)
          return 1;
        this.strip();
        var res;
        if (this.length > 1) {
          res = 1;
        } else {
          if (negative) {
            num = -num;
          }
          assert(num <= 67108863, "Number is too big");
          var w = this.words[0] | 0;
          res = w === num ? 0 : w < num ? -1 : 1;
        }
        if (this.negative !== 0)
          return -res | 0;
        return res;
      };
      BN.prototype.cmp = function cmp(num) {
        if (this.negative !== 0 && num.negative === 0)
          return -1;
        if (this.negative === 0 && num.negative !== 0)
          return 1;
        var res = this.ucmp(num);
        if (this.negative !== 0)
          return -res | 0;
        return res;
      };
      BN.prototype.ucmp = function ucmp(num) {
        if (this.length > num.length)
          return 1;
        if (this.length < num.length)
          return -1;
        var res = 0;
        for (var i = this.length - 1; i >= 0; i--) {
          var a = this.words[i] | 0;
          var b = num.words[i] | 0;
          if (a === b)
            continue;
          if (a < b) {
            res = -1;
          } else if (a > b) {
            res = 1;
          }
          break;
        }
        return res;
      };
      BN.prototype.gtn = function gtn(num) {
        return this.cmpn(num) === 1;
      };
      BN.prototype.gt = function gt(num) {
        return this.cmp(num) === 1;
      };
      BN.prototype.gten = function gten(num) {
        return this.cmpn(num) >= 0;
      };
      BN.prototype.gte = function gte(num) {
        return this.cmp(num) >= 0;
      };
      BN.prototype.ltn = function ltn(num) {
        return this.cmpn(num) === -1;
      };
      BN.prototype.lt = function lt(num) {
        return this.cmp(num) === -1;
      };
      BN.prototype.lten = function lten(num) {
        return this.cmpn(num) <= 0;
      };
      BN.prototype.lte = function lte(num) {
        return this.cmp(num) <= 0;
      };
      BN.prototype.eqn = function eqn(num) {
        return this.cmpn(num) === 0;
      };
      BN.prototype.eq = function eq(num) {
        return this.cmp(num) === 0;
      };
      BN.red = function red(num) {
        return new Red(num);
      };
      BN.prototype.toRed = function toRed(ctx) {
        assert(!this.red, "Already a number in reduction context");
        assert(this.negative === 0, "red works only with positives");
        return ctx.convertTo(this)._forceRed(ctx);
      };
      BN.prototype.fromRed = function fromRed() {
        assert(this.red, "fromRed works only with numbers in reduction context");
        return this.red.convertFrom(this);
      };
      BN.prototype._forceRed = function _forceRed(ctx) {
        this.red = ctx;
        return this;
      };
      BN.prototype.forceRed = function forceRed(ctx) {
        assert(!this.red, "Already a number in reduction context");
        return this._forceRed(ctx);
      };
      BN.prototype.redAdd = function redAdd(num) {
        assert(this.red, "redAdd works only with red numbers");
        return this.red.add(this, num);
      };
      BN.prototype.redIAdd = function redIAdd(num) {
        assert(this.red, "redIAdd works only with red numbers");
        return this.red.iadd(this, num);
      };
      BN.prototype.redSub = function redSub(num) {
        assert(this.red, "redSub works only with red numbers");
        return this.red.sub(this, num);
      };
      BN.prototype.redISub = function redISub(num) {
        assert(this.red, "redISub works only with red numbers");
        return this.red.isub(this, num);
      };
      BN.prototype.redShl = function redShl(num) {
        assert(this.red, "redShl works only with red numbers");
        return this.red.shl(this, num);
      };
      BN.prototype.redMul = function redMul(num) {
        assert(this.red, "redMul works only with red numbers");
        this.red._verify2(this, num);
        return this.red.mul(this, num);
      };
      BN.prototype.redIMul = function redIMul(num) {
        assert(this.red, "redMul works only with red numbers");
        this.red._verify2(this, num);
        return this.red.imul(this, num);
      };
      BN.prototype.redSqr = function redSqr() {
        assert(this.red, "redSqr works only with red numbers");
        this.red._verify1(this);
        return this.red.sqr(this);
      };
      BN.prototype.redISqr = function redISqr() {
        assert(this.red, "redISqr works only with red numbers");
        this.red._verify1(this);
        return this.red.isqr(this);
      };
      BN.prototype.redSqrt = function redSqrt() {
        assert(this.red, "redSqrt works only with red numbers");
        this.red._verify1(this);
        return this.red.sqrt(this);
      };
      BN.prototype.redInvm = function redInvm() {
        assert(this.red, "redInvm works only with red numbers");
        this.red._verify1(this);
        return this.red.invm(this);
      };
      BN.prototype.redNeg = function redNeg() {
        assert(this.red, "redNeg works only with red numbers");
        this.red._verify1(this);
        return this.red.neg(this);
      };
      BN.prototype.redPow = function redPow(num) {
        assert(this.red && !num.red, "redPow(normalNum)");
        this.red._verify1(this);
        return this.red.pow(this, num);
      };
      var primes = {
        k256: null,
        p224: null,
        p192: null,
        p25519: null
      };
      function MPrime(name, p) {
        this.name = name;
        this.p = new BN(p, 16);
        this.n = this.p.bitLength();
        this.k = new BN(1).iushln(this.n).isub(this.p);
        this.tmp = this._tmp();
      }
      MPrime.prototype._tmp = function _tmp() {
        var tmp = new BN(null);
        tmp.words = new Array(Math.ceil(this.n / 13));
        return tmp;
      };
      MPrime.prototype.ireduce = function ireduce(num) {
        var r = num;
        var rlen;
        do {
          this.split(r, this.tmp);
          r = this.imulK(r);
          r = r.iadd(this.tmp);
          rlen = r.bitLength();
        } while (rlen > this.n);
        var cmp = rlen < this.n ? -1 : r.ucmp(this.p);
        if (cmp === 0) {
          r.words[0] = 0;
          r.length = 1;
        } else if (cmp > 0) {
          r.isub(this.p);
        } else {
          if (r.strip !== void 0) {
            r.strip();
          } else {
            r._strip();
          }
        }
        return r;
      };
      MPrime.prototype.split = function split(input, out) {
        input.iushrn(this.n, 0, out);
      };
      MPrime.prototype.imulK = function imulK(num) {
        return num.imul(this.k);
      };
      function K256() {
        MPrime.call(
          this,
          "k256",
          "ffffffff ffffffff ffffffff ffffffff ffffffff ffffffff fffffffe fffffc2f"
        );
      }
      inherits(K256, MPrime);
      K256.prototype.split = function split(input, output2) {
        var mask = 4194303;
        var outLen = Math.min(input.length, 9);
        for (var i = 0; i < outLen; i++) {
          output2.words[i] = input.words[i];
        }
        output2.length = outLen;
        if (input.length <= 9) {
          input.words[0] = 0;
          input.length = 1;
          return;
        }
        var prev = input.words[9];
        output2.words[output2.length++] = prev & mask;
        for (i = 10; i < input.length; i++) {
          var next = input.words[i] | 0;
          input.words[i - 10] = (next & mask) << 4 | prev >>> 22;
          prev = next;
        }
        prev >>>= 22;
        input.words[i - 10] = prev;
        if (prev === 0 && input.length > 10) {
          input.length -= 10;
        } else {
          input.length -= 9;
        }
      };
      K256.prototype.imulK = function imulK(num) {
        num.words[num.length] = 0;
        num.words[num.length + 1] = 0;
        num.length += 2;
        var lo = 0;
        for (var i = 0; i < num.length; i++) {
          var w = num.words[i] | 0;
          lo += w * 977;
          num.words[i] = lo & 67108863;
          lo = w * 64 + (lo / 67108864 | 0);
        }
        if (num.words[num.length - 1] === 0) {
          num.length--;
          if (num.words[num.length - 1] === 0) {
            num.length--;
          }
        }
        return num;
      };
      function P224() {
        MPrime.call(
          this,
          "p224",
          "ffffffff ffffffff ffffffff ffffffff 00000000 00000000 00000001"
        );
      }
      inherits(P224, MPrime);
      function P192() {
        MPrime.call(
          this,
          "p192",
          "ffffffff ffffffff ffffffff fffffffe ffffffff ffffffff"
        );
      }
      inherits(P192, MPrime);
      function P25519() {
        MPrime.call(
          this,
          "25519",
          "7fffffffffffffff ffffffffffffffff ffffffffffffffff ffffffffffffffed"
        );
      }
      inherits(P25519, MPrime);
      P25519.prototype.imulK = function imulK(num) {
        var carry = 0;
        for (var i = 0; i < num.length; i++) {
          var hi = (num.words[i] | 0) * 19 + carry;
          var lo = hi & 67108863;
          hi >>>= 26;
          num.words[i] = lo;
          carry = hi;
        }
        if (carry !== 0) {
          num.words[num.length++] = carry;
        }
        return num;
      };
      BN._prime = function prime(name) {
        if (primes[name])
          return primes[name];
        var prime2;
        if (name === "k256") {
          prime2 = new K256();
        } else if (name === "p224") {
          prime2 = new P224();
        } else if (name === "p192") {
          prime2 = new P192();
        } else if (name === "p25519") {
          prime2 = new P25519();
        } else {
          throw new Error("Unknown prime " + name);
        }
        primes[name] = prime2;
        return prime2;
      };
      function Red(m) {
        if (typeof m === "string") {
          var prime = BN._prime(m);
          this.m = prime.p;
          this.prime = prime;
        } else {
          assert(m.gtn(1), "modulus must be greater than 1");
          this.m = m;
          this.prime = null;
        }
      }
      Red.prototype._verify1 = function _verify1(a) {
        assert(a.negative === 0, "red works only with positives");
        assert(a.red, "red works only with red numbers");
      };
      Red.prototype._verify2 = function _verify2(a, b) {
        assert((a.negative | b.negative) === 0, "red works only with positives");
        assert(
          a.red && a.red === b.red,
          "red works only with red numbers"
        );
      };
      Red.prototype.imod = function imod(a) {
        if (this.prime)
          return this.prime.ireduce(a)._forceRed(this);
        return a.umod(this.m)._forceRed(this);
      };
      Red.prototype.neg = function neg(a) {
        if (a.isZero()) {
          return a.clone();
        }
        return this.m.sub(a)._forceRed(this);
      };
      Red.prototype.add = function add(a, b) {
        this._verify2(a, b);
        var res = a.add(b);
        if (res.cmp(this.m) >= 0) {
          res.isub(this.m);
        }
        return res._forceRed(this);
      };
      Red.prototype.iadd = function iadd(a, b) {
        this._verify2(a, b);
        var res = a.iadd(b);
        if (res.cmp(this.m) >= 0) {
          res.isub(this.m);
        }
        return res;
      };
      Red.prototype.sub = function sub(a, b) {
        this._verify2(a, b);
        var res = a.sub(b);
        if (res.cmpn(0) < 0) {
          res.iadd(this.m);
        }
        return res._forceRed(this);
      };
      Red.prototype.isub = function isub(a, b) {
        this._verify2(a, b);
        var res = a.isub(b);
        if (res.cmpn(0) < 0) {
          res.iadd(this.m);
        }
        return res;
      };
      Red.prototype.shl = function shl(a, num) {
        this._verify1(a);
        return this.imod(a.ushln(num));
      };
      Red.prototype.imul = function imul(a, b) {
        this._verify2(a, b);
        return this.imod(a.imul(b));
      };
      Red.prototype.mul = function mul(a, b) {
        this._verify2(a, b);
        return this.imod(a.mul(b));
      };
      Red.prototype.isqr = function isqr(a) {
        return this.imul(a, a.clone());
      };
      Red.prototype.sqr = function sqr(a) {
        return this.mul(a, a);
      };
      Red.prototype.sqrt = function sqrt(a) {
        if (a.isZero())
          return a.clone();
        var mod3 = this.m.andln(3);
        assert(mod3 % 2 === 1);
        if (mod3 === 3) {
          var pow = this.m.add(new BN(1)).iushrn(2);
          return this.pow(a, pow);
        }
        var q = this.m.subn(1);
        var s = 0;
        while (!q.isZero() && q.andln(1) === 0) {
          s++;
          q.iushrn(1);
        }
        assert(!q.isZero());
        var one = new BN(1).toRed(this);
        var nOne = one.redNeg();
        var lpow = this.m.subn(1).iushrn(1);
        var z = this.m.bitLength();
        z = new BN(2 * z * z).toRed(this);
        while (this.pow(z, lpow).cmp(nOne) !== 0) {
          z.redIAdd(nOne);
        }
        var c = this.pow(z, q);
        var r = this.pow(a, q.addn(1).iushrn(1));
        var t2 = this.pow(a, q);
        var m = s;
        while (t2.cmp(one) !== 0) {
          var tmp = t2;
          for (var i = 0; tmp.cmp(one) !== 0; i++) {
            tmp = tmp.redSqr();
          }
          assert(i < m);
          var b = this.pow(c, new BN(1).iushln(m - i - 1));
          r = r.redMul(b);
          c = b.redSqr();
          t2 = t2.redMul(c);
          m = i;
        }
        return r;
      };
      Red.prototype.invm = function invm(a) {
        var inv = a._invmp(this.m);
        if (inv.negative !== 0) {
          inv.negative = 0;
          return this.imod(inv).redNeg();
        } else {
          return this.imod(inv);
        }
      };
      Red.prototype.pow = function pow(a, num) {
        if (num.isZero())
          return new BN(1).toRed(this);
        if (num.cmpn(1) === 0)
          return a.clone();
        var windowSize = 4;
        var wnd = new Array(1 << windowSize);
        wnd[0] = new BN(1).toRed(this);
        wnd[1] = a;
        for (var i = 2; i < wnd.length; i++) {
          wnd[i] = this.mul(wnd[i - 1], a);
        }
        var res = wnd[0];
        var current = 0;
        var currentLen = 0;
        var start = num.bitLength() % 26;
        if (start === 0) {
          start = 26;
        }
        for (i = num.length - 1; i >= 0; i--) {
          var word = num.words[i];
          for (var j = start - 1; j >= 0; j--) {
            var bit = word >> j & 1;
            if (res !== wnd[0]) {
              res = this.sqr(res);
            }
            if (bit === 0 && current === 0) {
              currentLen = 0;
              continue;
            }
            current <<= 1;
            current |= bit;
            currentLen++;
            if (currentLen !== windowSize && (i !== 0 || j !== 0))
              continue;
            res = this.mul(res, wnd[current]);
            currentLen = 0;
            current = 0;
          }
          start = 26;
        }
        return res;
      };
      Red.prototype.convertTo = function convertTo(num) {
        var r = num.umod(this.m);
        return r === num ? r.clone() : r;
      };
      Red.prototype.convertFrom = function convertFrom(num) {
        var res = num.clone();
        res.red = null;
        return res;
      };
      BN.mont = function mont(num) {
        return new Mont(num);
      };
      function Mont(m) {
        Red.call(this, m);
        this.shift = this.m.bitLength();
        if (this.shift % 26 !== 0) {
          this.shift += 26 - this.shift % 26;
        }
        this.r = new BN(1).iushln(this.shift);
        this.r2 = this.imod(this.r.sqr());
        this.rinv = this.r._invmp(this.m);
        this.minv = this.rinv.mul(this.r).isubn(1).div(this.m);
        this.minv = this.minv.umod(this.r);
        this.minv = this.r.sub(this.minv);
      }
      inherits(Mont, Red);
      Mont.prototype.convertTo = function convertTo(num) {
        return this.imod(num.ushln(this.shift));
      };
      Mont.prototype.convertFrom = function convertFrom(num) {
        var r = this.imod(num.mul(this.rinv));
        r.red = null;
        return r;
      };
      Mont.prototype.imul = function imul(a, b) {
        if (a.isZero() || b.isZero()) {
          a.words[0] = 0;
          a.length = 1;
          return a;
        }
        var t2 = a.imul(b);
        var c = t2.maskn(this.shift).mul(this.minv).imaskn(this.shift).mul(this.m);
        var u = t2.isub(c).iushrn(this.shift);
        var res = u;
        if (u.cmp(this.m) >= 0) {
          res = u.isub(this.m);
        } else if (u.cmpn(0) < 0) {
          res = u.iadd(this.m);
        }
        return res._forceRed(this);
      };
      Mont.prototype.mul = function mul(a, b) {
        if (a.isZero() || b.isZero())
          return new BN(0)._forceRed(this);
        var t2 = a.mul(b);
        var c = t2.maskn(this.shift).mul(this.minv).imaskn(this.shift).mul(this.m);
        var u = t2.isub(c).iushrn(this.shift);
        var res = u;
        if (u.cmp(this.m) >= 0) {
          res = u.isub(this.m);
        } else if (u.cmpn(0) < 0) {
          res = u.iadd(this.m);
        }
        return res._forceRed(this);
      };
      Mont.prototype.invm = function invm(a) {
        var res = this.imod(a._invmp(this.m).mul(this.r2));
        return res._forceRed(this);
      };
    })(typeof module === "undefined" || module, exports);
  }
});

// node_modules/inherits/inherits_browser.js
var require_inherits_browser = __commonJS({
  "node_modules/inherits/inherits_browser.js"(exports, module) {
    if (typeof Object.create === "function") {
      module.exports = function inherits(ctor, superCtor) {
        if (superCtor) {
          ctor.super_ = superCtor;
          ctor.prototype = Object.create(superCtor.prototype, {
            constructor: {
              value: ctor,
              enumerable: false,
              writable: true,
              configurable: true
            }
          });
        }
      };
    } else {
      module.exports = function inherits(ctor, superCtor) {
        if (superCtor) {
          ctor.super_ = superCtor;
          var TempCtor = function() {
          };
          TempCtor.prototype = superCtor.prototype;
          ctor.prototype = new TempCtor();
          ctor.prototype.constructor = ctor;
        }
      };
    }
  }
});

// node_modules/inherits/inherits.js
var require_inherits = __commonJS({
  "node_modules/inherits/inherits.js"(exports, module) {
    try {
      util = __require("util");
      if (typeof util.inherits !== "function")
        throw "";
      module.exports = util.inherits;
    } catch (e) {
      module.exports = require_inherits_browser();
    }
    var util;
  }
});

// node_modules/safer-buffer/safer.js
var require_safer = __commonJS({
  "node_modules/safer-buffer/safer.js"(exports, module) {
    "use strict";
    var buffer = __require("buffer");
    var Buffer2 = buffer.Buffer;
    var safer = {};
    var key;
    for (key in buffer) {
      if (!buffer.hasOwnProperty(key))
        continue;
      if (key === "SlowBuffer" || key === "Buffer")
        continue;
      safer[key] = buffer[key];
    }
    var Safer = safer.Buffer = {};
    for (key in Buffer2) {
      if (!Buffer2.hasOwnProperty(key))
        continue;
      if (key === "allocUnsafe" || key === "allocUnsafeSlow")
        continue;
      Safer[key] = Buffer2[key];
    }
    safer.Buffer.prototype = Buffer2.prototype;
    if (!Safer.from || Safer.from === Uint8Array.from) {
      Safer.from = function(value, encodingOrOffset, length) {
        if (typeof value === "number") {
          throw new TypeError('The "value" argument must not be of type number. Received type ' + typeof value);
        }
        if (value && typeof value.length === "undefined") {
          throw new TypeError("The first argument must be one of type string, Buffer, ArrayBuffer, Array, or Array-like Object. Received type " + typeof value);
        }
        return Buffer2(value, encodingOrOffset, length);
      };
    }
    if (!Safer.alloc) {
      Safer.alloc = function(size, fill, encoding) {
        if (typeof size !== "number") {
          throw new TypeError('The "size" argument must be of type number. Received type ' + typeof size);
        }
        if (size < 0 || size >= 2 * (1 << 30)) {
          throw new RangeError('The value "' + size + '" is invalid for option "size"');
        }
        var buf = Buffer2(size);
        if (!fill || fill.length === 0) {
          buf.fill(0);
        } else if (typeof encoding === "string") {
          buf.fill(fill, encoding);
        } else {
          buf.fill(fill);
        }
        return buf;
      };
    }
    if (!safer.kStringMaxLength) {
      try {
        safer.kStringMaxLength = process.binding("buffer").kStringMaxLength;
      } catch (e) {
      }
    }
    if (!safer.constants) {
      safer.constants = {
        MAX_LENGTH: safer.kMaxLength
      };
      if (safer.kStringMaxLength) {
        safer.constants.MAX_STRING_LENGTH = safer.kStringMaxLength;
      }
    }
    module.exports = safer;
  }
});

// node_modules/asn1.js/lib/asn1/base/reporter.js
var require_reporter = __commonJS({
  "node_modules/asn1.js/lib/asn1/base/reporter.js"(exports) {
    "use strict";
    var inherits = require_inherits();
    function Reporter(options) {
      this._reporterState = {
        obj: null,
        path: [],
        options: options || {},
        errors: []
      };
    }
    exports.Reporter = Reporter;
    Reporter.prototype.isError = function isError(obj) {
      return obj instanceof ReporterError;
    };
    Reporter.prototype.save = function save() {
      const state = this._reporterState;
      return { obj: state.obj, pathLen: state.path.length };
    };
    Reporter.prototype.restore = function restore(data) {
      const state = this._reporterState;
      state.obj = data.obj;
      state.path = state.path.slice(0, data.pathLen);
    };
    Reporter.prototype.enterKey = function enterKey(key) {
      return this._reporterState.path.push(key);
    };
    Reporter.prototype.exitKey = function exitKey(index) {
      const state = this._reporterState;
      state.path = state.path.slice(0, index - 1);
    };
    Reporter.prototype.leaveKey = function leaveKey(index, key, value) {
      const state = this._reporterState;
      this.exitKey(index);
      if (state.obj !== null)
        state.obj[key] = value;
    };
    Reporter.prototype.path = function path() {
      return this._reporterState.path.join("/");
    };
    Reporter.prototype.enterObject = function enterObject() {
      const state = this._reporterState;
      const prev = state.obj;
      state.obj = {};
      return prev;
    };
    Reporter.prototype.leaveObject = function leaveObject(prev) {
      const state = this._reporterState;
      const now = state.obj;
      state.obj = prev;
      return now;
    };
    Reporter.prototype.error = function error2(msg) {
      let err;
      const state = this._reporterState;
      const inherited = msg instanceof ReporterError;
      if (inherited) {
        err = msg;
      } else {
        err = new ReporterError(state.path.map(function(elem) {
          return "[" + JSON.stringify(elem) + "]";
        }).join(""), msg.message || msg, msg.stack);
      }
      if (!state.options.partial)
        throw err;
      if (!inherited)
        state.errors.push(err);
      return err;
    };
    Reporter.prototype.wrapResult = function wrapResult(result) {
      const state = this._reporterState;
      if (!state.options.partial)
        return result;
      return {
        result: this.isError(result) ? null : result,
        errors: state.errors
      };
    };
    function ReporterError(path, msg) {
      this.path = path;
      this.rethrow(msg);
    }
    inherits(ReporterError, Error);
    ReporterError.prototype.rethrow = function rethrow(msg) {
      this.message = msg + " at: " + (this.path || "(shallow)");
      if (Error.captureStackTrace)
        Error.captureStackTrace(this, ReporterError);
      if (!this.stack) {
        try {
          throw new Error(this.message);
        } catch (e) {
          this.stack = e.stack;
        }
      }
      return this;
    };
  }
});

// node_modules/asn1.js/lib/asn1/base/buffer.js
var require_buffer = __commonJS({
  "node_modules/asn1.js/lib/asn1/base/buffer.js"(exports) {
    "use strict";
    var inherits = require_inherits();
    var Reporter = require_reporter().Reporter;
    var Buffer2 = require_safer().Buffer;
    function DecoderBuffer(base, options) {
      Reporter.call(this, options);
      if (!Buffer2.isBuffer(base)) {
        this.error("Input not Buffer");
        return;
      }
      this.base = base;
      this.offset = 0;
      this.length = base.length;
    }
    inherits(DecoderBuffer, Reporter);
    exports.DecoderBuffer = DecoderBuffer;
    DecoderBuffer.isDecoderBuffer = function isDecoderBuffer(data) {
      if (data instanceof DecoderBuffer) {
        return true;
      }
      const isCompatible = typeof data === "object" && Buffer2.isBuffer(data.base) && data.constructor.name === "DecoderBuffer" && typeof data.offset === "number" && typeof data.length === "number" && typeof data.save === "function" && typeof data.restore === "function" && typeof data.isEmpty === "function" && typeof data.readUInt8 === "function" && typeof data.skip === "function" && typeof data.raw === "function";
      return isCompatible;
    };
    DecoderBuffer.prototype.save = function save() {
      return { offset: this.offset, reporter: Reporter.prototype.save.call(this) };
    };
    DecoderBuffer.prototype.restore = function restore(save) {
      const res = new DecoderBuffer(this.base);
      res.offset = save.offset;
      res.length = this.offset;
      this.offset = save.offset;
      Reporter.prototype.restore.call(this, save.reporter);
      return res;
    };
    DecoderBuffer.prototype.isEmpty = function isEmpty() {
      return this.offset === this.length;
    };
    DecoderBuffer.prototype.readUInt8 = function readUInt8(fail) {
      if (this.offset + 1 <= this.length)
        return this.base.readUInt8(this.offset++, true);
      else
        return this.error(fail || "DecoderBuffer overrun");
    };
    DecoderBuffer.prototype.skip = function skip(bytes, fail) {
      if (!(this.offset + bytes <= this.length))
        return this.error(fail || "DecoderBuffer overrun");
      const res = new DecoderBuffer(this.base);
      res._reporterState = this._reporterState;
      res.offset = this.offset;
      res.length = this.offset + bytes;
      this.offset += bytes;
      return res;
    };
    DecoderBuffer.prototype.raw = function raw(save) {
      return this.base.slice(save ? save.offset : this.offset, this.length);
    };
    function EncoderBuffer(value, reporter) {
      if (Array.isArray(value)) {
        this.length = 0;
        this.value = value.map(function(item) {
          if (!EncoderBuffer.isEncoderBuffer(item))
            item = new EncoderBuffer(item, reporter);
          this.length += item.length;
          return item;
        }, this);
      } else if (typeof value === "number") {
        if (!(0 <= value && value <= 255))
          return reporter.error("non-byte EncoderBuffer value");
        this.value = value;
        this.length = 1;
      } else if (typeof value === "string") {
        this.value = value;
        this.length = Buffer2.byteLength(value);
      } else if (Buffer2.isBuffer(value)) {
        this.value = value;
        this.length = value.length;
      } else {
        return reporter.error("Unsupported type: " + typeof value);
      }
    }
    exports.EncoderBuffer = EncoderBuffer;
    EncoderBuffer.isEncoderBuffer = function isEncoderBuffer(data) {
      if (data instanceof EncoderBuffer) {
        return true;
      }
      const isCompatible = typeof data === "object" && data.constructor.name === "EncoderBuffer" && typeof data.length === "number" && typeof data.join === "function";
      return isCompatible;
    };
    EncoderBuffer.prototype.join = function join(out, offset) {
      if (!out)
        out = Buffer2.alloc(this.length);
      if (!offset)
        offset = 0;
      if (this.length === 0)
        return out;
      if (Array.isArray(this.value)) {
        this.value.forEach(function(item) {
          item.join(out, offset);
          offset += item.length;
        });
      } else {
        if (typeof this.value === "number")
          out[offset] = this.value;
        else if (typeof this.value === "string")
          out.write(this.value, offset);
        else if (Buffer2.isBuffer(this.value))
          this.value.copy(out, offset);
        offset += this.length;
      }
      return out;
    };
  }
});

// node_modules/minimalistic-assert/index.js
var require_minimalistic_assert = __commonJS({
  "node_modules/minimalistic-assert/index.js"(exports, module) {
    module.exports = assert;
    function assert(val, msg) {
      if (!val)
        throw new Error(msg || "Assertion failed");
    }
    assert.equal = function assertEqual(l, r, msg) {
      if (l != r)
        throw new Error(msg || "Assertion failed: " + l + " != " + r);
    };
  }
});

// node_modules/asn1.js/lib/asn1/base/node.js
var require_node = __commonJS({
  "node_modules/asn1.js/lib/asn1/base/node.js"(exports, module) {
    "use strict";
    var Reporter = require_reporter().Reporter;
    var EncoderBuffer = require_buffer().EncoderBuffer;
    var DecoderBuffer = require_buffer().DecoderBuffer;
    var assert = require_minimalistic_assert();
    var tags = [
      "seq",
      "seqof",
      "set",
      "setof",
      "objid",
      "bool",
      "gentime",
      "utctime",
      "null_",
      "enum",
      "int",
      "objDesc",
      "bitstr",
      "bmpstr",
      "charstr",
      "genstr",
      "graphstr",
      "ia5str",
      "iso646str",
      "numstr",
      "octstr",
      "printstr",
      "t61str",
      "unistr",
      "utf8str",
      "videostr"
    ];
    var methods = [
      "key",
      "obj",
      "use",
      "optional",
      "explicit",
      "implicit",
      "def",
      "choice",
      "any",
      "contains"
    ].concat(tags);
    var overrided = [
      "_peekTag",
      "_decodeTag",
      "_use",
      "_decodeStr",
      "_decodeObjid",
      "_decodeTime",
      "_decodeNull",
      "_decodeInt",
      "_decodeBool",
      "_decodeList",
      "_encodeComposite",
      "_encodeStr",
      "_encodeObjid",
      "_encodeTime",
      "_encodeNull",
      "_encodeInt",
      "_encodeBool"
    ];
    function Node(enc, parent, name) {
      const state = {};
      this._baseState = state;
      state.name = name;
      state.enc = enc;
      state.parent = parent || null;
      state.children = null;
      state.tag = null;
      state.args = null;
      state.reverseArgs = null;
      state.choice = null;
      state.optional = false;
      state.any = false;
      state.obj = false;
      state.use = null;
      state.useDecoder = null;
      state.key = null;
      state["default"] = null;
      state.explicit = null;
      state.implicit = null;
      state.contains = null;
      if (!state.parent) {
        state.children = [];
        this._wrap();
      }
    }
    module.exports = Node;
    var stateProps = [
      "enc",
      "parent",
      "children",
      "tag",
      "args",
      "reverseArgs",
      "choice",
      "optional",
      "any",
      "obj",
      "use",
      "alteredUse",
      "key",
      "default",
      "explicit",
      "implicit",
      "contains"
    ];
    Node.prototype.clone = function clone() {
      const state = this._baseState;
      const cstate = {};
      stateProps.forEach(function(prop) {
        cstate[prop] = state[prop];
      });
      const res = new this.constructor(cstate.parent);
      res._baseState = cstate;
      return res;
    };
    Node.prototype._wrap = function wrap() {
      const state = this._baseState;
      methods.forEach(function(method) {
        this[method] = function _wrappedMethod() {
          const clone = new this.constructor(this);
          state.children.push(clone);
          return clone[method].apply(clone, arguments);
        };
      }, this);
    };
    Node.prototype._init = function init2(body) {
      const state = this._baseState;
      assert(state.parent === null);
      body.call(this);
      state.children = state.children.filter(function(child) {
        return child._baseState.parent === this;
      }, this);
      assert.equal(state.children.length, 1, "Root node can have only one child");
    };
    Node.prototype._useArgs = function useArgs(args) {
      const state = this._baseState;
      const children = args.filter(function(arg) {
        return arg instanceof this.constructor;
      }, this);
      args = args.filter(function(arg) {
        return !(arg instanceof this.constructor);
      }, this);
      if (children.length !== 0) {
        assert(state.children === null);
        state.children = children;
        children.forEach(function(child) {
          child._baseState.parent = this;
        }, this);
      }
      if (args.length !== 0) {
        assert(state.args === null);
        state.args = args;
        state.reverseArgs = args.map(function(arg) {
          if (typeof arg !== "object" || arg.constructor !== Object)
            return arg;
          const res = {};
          Object.keys(arg).forEach(function(key) {
            if (key == (key | 0))
              key |= 0;
            const value = arg[key];
            res[value] = key;
          });
          return res;
        });
      }
    };
    overrided.forEach(function(method) {
      Node.prototype[method] = function _overrided() {
        const state = this._baseState;
        throw new Error(method + " not implemented for encoding: " + state.enc);
      };
    });
    tags.forEach(function(tag) {
      Node.prototype[tag] = function _tagMethod() {
        const state = this._baseState;
        const args = Array.prototype.slice.call(arguments);
        assert(state.tag === null);
        state.tag = tag;
        this._useArgs(args);
        return this;
      };
    });
    Node.prototype.use = function use2(item) {
      assert(item);
      const state = this._baseState;
      assert(state.use === null);
      state.use = item;
      return this;
    };
    Node.prototype.optional = function optional() {
      const state = this._baseState;
      state.optional = true;
      return this;
    };
    Node.prototype.def = function def(val) {
      const state = this._baseState;
      assert(state["default"] === null);
      state["default"] = val;
      state.optional = true;
      return this;
    };
    Node.prototype.explicit = function explicit(num) {
      const state = this._baseState;
      assert(state.explicit === null && state.implicit === null);
      state.explicit = num;
      return this;
    };
    Node.prototype.implicit = function implicit(num) {
      const state = this._baseState;
      assert(state.explicit === null && state.implicit === null);
      state.implicit = num;
      return this;
    };
    Node.prototype.obj = function obj() {
      const state = this._baseState;
      const args = Array.prototype.slice.call(arguments);
      state.obj = true;
      if (args.length !== 0)
        this._useArgs(args);
      return this;
    };
    Node.prototype.key = function key(newKey) {
      const state = this._baseState;
      assert(state.key === null);
      state.key = newKey;
      return this;
    };
    Node.prototype.any = function any() {
      const state = this._baseState;
      state.any = true;
      return this;
    };
    Node.prototype.choice = function choice(obj) {
      const state = this._baseState;
      assert(state.choice === null);
      state.choice = obj;
      this._useArgs(Object.keys(obj).map(function(key) {
        return obj[key];
      }));
      return this;
    };
    Node.prototype.contains = function contains(item) {
      const state = this._baseState;
      assert(state.use === null);
      state.contains = item;
      return this;
    };
    Node.prototype._decode = function decode(input, options) {
      const state = this._baseState;
      if (state.parent === null)
        return input.wrapResult(state.children[0]._decode(input, options));
      let result = state["default"];
      let present = true;
      let prevKey = null;
      if (state.key !== null)
        prevKey = input.enterKey(state.key);
      if (state.optional) {
        let tag = null;
        if (state.explicit !== null)
          tag = state.explicit;
        else if (state.implicit !== null)
          tag = state.implicit;
        else if (state.tag !== null)
          tag = state.tag;
        if (tag === null && !state.any) {
          const save = input.save();
          try {
            if (state.choice === null)
              this._decodeGeneric(state.tag, input, options);
            else
              this._decodeChoice(input, options);
            present = true;
          } catch (e) {
            present = false;
          }
          input.restore(save);
        } else {
          present = this._peekTag(input, tag, state.any);
          if (input.isError(present))
            return present;
        }
      }
      let prevObj;
      if (state.obj && present)
        prevObj = input.enterObject();
      if (present) {
        if (state.explicit !== null) {
          const explicit = this._decodeTag(input, state.explicit);
          if (input.isError(explicit))
            return explicit;
          input = explicit;
        }
        const start = input.offset;
        if (state.use === null && state.choice === null) {
          let save;
          if (state.any)
            save = input.save();
          const body = this._decodeTag(
            input,
            state.implicit !== null ? state.implicit : state.tag,
            state.any
          );
          if (input.isError(body))
            return body;
          if (state.any)
            result = input.raw(save);
          else
            input = body;
        }
        if (options && options.track && state.tag !== null)
          options.track(input.path(), start, input.length, "tagged");
        if (options && options.track && state.tag !== null)
          options.track(input.path(), input.offset, input.length, "content");
        if (state.any) {
        } else if (state.choice === null) {
          result = this._decodeGeneric(state.tag, input, options);
        } else {
          result = this._decodeChoice(input, options);
        }
        if (input.isError(result))
          return result;
        if (!state.any && state.choice === null && state.children !== null) {
          state.children.forEach(function decodeChildren(child) {
            child._decode(input, options);
          });
        }
        if (state.contains && (state.tag === "octstr" || state.tag === "bitstr")) {
          const data = new DecoderBuffer(result);
          result = this._getUse(state.contains, input._reporterState.obj)._decode(data, options);
        }
      }
      if (state.obj && present)
        result = input.leaveObject(prevObj);
      if (state.key !== null && (result !== null || present === true))
        input.leaveKey(prevKey, state.key, result);
      else if (prevKey !== null)
        input.exitKey(prevKey);
      return result;
    };
    Node.prototype._decodeGeneric = function decodeGeneric(tag, input, options) {
      const state = this._baseState;
      if (tag === "seq" || tag === "set")
        return null;
      if (tag === "seqof" || tag === "setof")
        return this._decodeList(input, tag, state.args[0], options);
      else if (/str$/.test(tag))
        return this._decodeStr(input, tag, options);
      else if (tag === "objid" && state.args)
        return this._decodeObjid(input, state.args[0], state.args[1], options);
      else if (tag === "objid")
        return this._decodeObjid(input, null, null, options);
      else if (tag === "gentime" || tag === "utctime")
        return this._decodeTime(input, tag, options);
      else if (tag === "null_")
        return this._decodeNull(input, options);
      else if (tag === "bool")
        return this._decodeBool(input, options);
      else if (tag === "objDesc")
        return this._decodeStr(input, tag, options);
      else if (tag === "int" || tag === "enum")
        return this._decodeInt(input, state.args && state.args[0], options);
      if (state.use !== null) {
        return this._getUse(state.use, input._reporterState.obj)._decode(input, options);
      } else {
        return input.error("unknown tag: " + tag);
      }
    };
    Node.prototype._getUse = function _getUse(entity, obj) {
      const state = this._baseState;
      state.useDecoder = this._use(entity, obj);
      assert(state.useDecoder._baseState.parent === null);
      state.useDecoder = state.useDecoder._baseState.children[0];
      if (state.implicit !== state.useDecoder._baseState.implicit) {
        state.useDecoder = state.useDecoder.clone();
        state.useDecoder._baseState.implicit = state.implicit;
      }
      return state.useDecoder;
    };
    Node.prototype._decodeChoice = function decodeChoice(input, options) {
      const state = this._baseState;
      let result = null;
      let match = false;
      Object.keys(state.choice).some(function(key) {
        const save = input.save();
        const node = state.choice[key];
        try {
          const value = node._decode(input, options);
          if (input.isError(value))
            return false;
          result = { type: key, value };
          match = true;
        } catch (e) {
          input.restore(save);
          return false;
        }
        return true;
      }, this);
      if (!match)
        return input.error("Choice not matched");
      return result;
    };
    Node.prototype._createEncoderBuffer = function createEncoderBuffer(data) {
      return new EncoderBuffer(data, this.reporter);
    };
    Node.prototype._encode = function encode(data, reporter, parent) {
      const state = this._baseState;
      if (state["default"] !== null && state["default"] === data)
        return;
      const result = this._encodeValue(data, reporter, parent);
      if (result === void 0)
        return;
      if (this._skipDefault(result, reporter, parent))
        return;
      return result;
    };
    Node.prototype._encodeValue = function encode(data, reporter, parent) {
      const state = this._baseState;
      if (state.parent === null)
        return state.children[0]._encode(data, reporter || new Reporter());
      let result = null;
      this.reporter = reporter;
      if (state.optional && data === void 0) {
        if (state["default"] !== null)
          data = state["default"];
        else
          return;
      }
      let content = null;
      let primitive = false;
      if (state.any) {
        result = this._createEncoderBuffer(data);
      } else if (state.choice) {
        result = this._encodeChoice(data, reporter);
      } else if (state.contains) {
        content = this._getUse(state.contains, parent)._encode(data, reporter);
        primitive = true;
      } else if (state.children) {
        content = state.children.map(function(child) {
          if (child._baseState.tag === "null_")
            return child._encode(null, reporter, data);
          if (child._baseState.key === null)
            return reporter.error("Child should have a key");
          const prevKey = reporter.enterKey(child._baseState.key);
          if (typeof data !== "object")
            return reporter.error("Child expected, but input is not object");
          const res = child._encode(data[child._baseState.key], reporter, data);
          reporter.leaveKey(prevKey);
          return res;
        }, this).filter(function(child) {
          return child;
        });
        content = this._createEncoderBuffer(content);
      } else {
        if (state.tag === "seqof" || state.tag === "setof") {
          if (!(state.args && state.args.length === 1))
            return reporter.error("Too many args for : " + state.tag);
          if (!Array.isArray(data))
            return reporter.error("seqof/setof, but data is not Array");
          const child = this.clone();
          child._baseState.implicit = null;
          content = this._createEncoderBuffer(data.map(function(item) {
            const state2 = this._baseState;
            return this._getUse(state2.args[0], data)._encode(item, reporter);
          }, child));
        } else if (state.use !== null) {
          result = this._getUse(state.use, parent)._encode(data, reporter);
        } else {
          content = this._encodePrimitive(state.tag, data);
          primitive = true;
        }
      }
      if (!state.any && state.choice === null) {
        const tag = state.implicit !== null ? state.implicit : state.tag;
        const cls = state.implicit === null ? "universal" : "context";
        if (tag === null) {
          if (state.use === null)
            reporter.error("Tag could be omitted only for .use()");
        } else {
          if (state.use === null)
            result = this._encodeComposite(tag, primitive, cls, content);
        }
      }
      if (state.explicit !== null)
        result = this._encodeComposite(state.explicit, false, "context", result);
      return result;
    };
    Node.prototype._encodeChoice = function encodeChoice(data, reporter) {
      const state = this._baseState;
      const node = state.choice[data.type];
      if (!node) {
        assert(
          false,
          data.type + " not found in " + JSON.stringify(Object.keys(state.choice))
        );
      }
      return node._encode(data.value, reporter);
    };
    Node.prototype._encodePrimitive = function encodePrimitive(tag, data) {
      const state = this._baseState;
      if (/str$/.test(tag))
        return this._encodeStr(data, tag);
      else if (tag === "objid" && state.args)
        return this._encodeObjid(data, state.reverseArgs[0], state.args[1]);
      else if (tag === "objid")
        return this._encodeObjid(data, null, null);
      else if (tag === "gentime" || tag === "utctime")
        return this._encodeTime(data, tag);
      else if (tag === "null_")
        return this._encodeNull();
      else if (tag === "int" || tag === "enum")
        return this._encodeInt(data, state.args && state.reverseArgs[0]);
      else if (tag === "bool")
        return this._encodeBool(data);
      else if (tag === "objDesc")
        return this._encodeStr(data, tag);
      else
        throw new Error("Unsupported tag: " + tag);
    };
    Node.prototype._isNumstr = function isNumstr(str) {
      return /^[0-9 ]*$/.test(str);
    };
    Node.prototype._isPrintstr = function isPrintstr(str) {
      return /^[A-Za-z0-9 '()+,-./:=?]*$/.test(str);
    };
  }
});

// node_modules/asn1.js/lib/asn1/constants/der.js
var require_der = __commonJS({
  "node_modules/asn1.js/lib/asn1/constants/der.js"(exports) {
    "use strict";
    function reverse(map) {
      const res = {};
      Object.keys(map).forEach(function(key) {
        if ((key | 0) == key)
          key = key | 0;
        const value = map[key];
        res[value] = key;
      });
      return res;
    }
    exports.tagClass = {
      0: "universal",
      1: "application",
      2: "context",
      3: "private"
    };
    exports.tagClassByName = reverse(exports.tagClass);
    exports.tag = {
      0: "end",
      1: "bool",
      2: "int",
      3: "bitstr",
      4: "octstr",
      5: "null_",
      6: "objid",
      7: "objDesc",
      8: "external",
      9: "real",
      10: "enum",
      11: "embed",
      12: "utf8str",
      13: "relativeOid",
      16: "seq",
      17: "set",
      18: "numstr",
      19: "printstr",
      20: "t61str",
      21: "videostr",
      22: "ia5str",
      23: "utctime",
      24: "gentime",
      25: "graphstr",
      26: "iso646str",
      27: "genstr",
      28: "unistr",
      29: "charstr",
      30: "bmpstr"
    };
    exports.tagByName = reverse(exports.tag);
  }
});

// node_modules/asn1.js/lib/asn1/encoders/der.js
var require_der2 = __commonJS({
  "node_modules/asn1.js/lib/asn1/encoders/der.js"(exports, module) {
    "use strict";
    var inherits = require_inherits();
    var Buffer2 = require_safer().Buffer;
    var Node = require_node();
    var der = require_der();
    function DEREncoder(entity) {
      this.enc = "der";
      this.name = entity.name;
      this.entity = entity;
      this.tree = new DERNode();
      this.tree._init(entity.body);
    }
    module.exports = DEREncoder;
    DEREncoder.prototype.encode = function encode(data, reporter) {
      return this.tree._encode(data, reporter).join();
    };
    function DERNode(parent) {
      Node.call(this, "der", parent);
    }
    inherits(DERNode, Node);
    DERNode.prototype._encodeComposite = function encodeComposite(tag, primitive, cls, content) {
      const encodedTag = encodeTag(tag, primitive, cls, this.reporter);
      if (content.length < 128) {
        const header2 = Buffer2.alloc(2);
        header2[0] = encodedTag;
        header2[1] = content.length;
        return this._createEncoderBuffer([header2, content]);
      }
      let lenOctets = 1;
      for (let i = content.length; i >= 256; i >>= 8)
        lenOctets++;
      const header = Buffer2.alloc(1 + 1 + lenOctets);
      header[0] = encodedTag;
      header[1] = 128 | lenOctets;
      for (let i = 1 + lenOctets, j = content.length; j > 0; i--, j >>= 8)
        header[i] = j & 255;
      return this._createEncoderBuffer([header, content]);
    };
    DERNode.prototype._encodeStr = function encodeStr(str, tag) {
      if (tag === "bitstr") {
        return this._createEncoderBuffer([str.unused | 0, str.data]);
      } else if (tag === "bmpstr") {
        const buf = Buffer2.alloc(str.length * 2);
        for (let i = 0; i < str.length; i++) {
          buf.writeUInt16BE(str.charCodeAt(i), i * 2);
        }
        return this._createEncoderBuffer(buf);
      } else if (tag === "numstr") {
        if (!this._isNumstr(str)) {
          return this.reporter.error("Encoding of string type: numstr supports only digits and space");
        }
        return this._createEncoderBuffer(str);
      } else if (tag === "printstr") {
        if (!this._isPrintstr(str)) {
          return this.reporter.error("Encoding of string type: printstr supports only latin upper and lower case letters, digits, space, apostrophe, left and rigth parenthesis, plus sign, comma, hyphen, dot, slash, colon, equal sign, question mark");
        }
        return this._createEncoderBuffer(str);
      } else if (/str$/.test(tag)) {
        return this._createEncoderBuffer(str);
      } else if (tag === "objDesc") {
        return this._createEncoderBuffer(str);
      } else {
        return this.reporter.error("Encoding of string type: " + tag + " unsupported");
      }
    };
    DERNode.prototype._encodeObjid = function encodeObjid(id, values, relative) {
      if (typeof id === "string") {
        if (!values)
          return this.reporter.error("string objid given, but no values map found");
        if (!values.hasOwnProperty(id))
          return this.reporter.error("objid not found in values map");
        id = values[id].split(/[\s.]+/g);
        for (let i = 0; i < id.length; i++)
          id[i] |= 0;
      } else if (Array.isArray(id)) {
        id = id.slice();
        for (let i = 0; i < id.length; i++)
          id[i] |= 0;
      }
      if (!Array.isArray(id)) {
        return this.reporter.error("objid() should be either array or string, got: " + JSON.stringify(id));
      }
      if (!relative) {
        if (id[1] >= 40)
          return this.reporter.error("Second objid identifier OOB");
        id.splice(0, 2, id[0] * 40 + id[1]);
      }
      let size = 0;
      for (let i = 0; i < id.length; i++) {
        let ident = id[i];
        for (size++; ident >= 128; ident >>= 7)
          size++;
      }
      const objid = Buffer2.alloc(size);
      let offset = objid.length - 1;
      for (let i = id.length - 1; i >= 0; i--) {
        let ident = id[i];
        objid[offset--] = ident & 127;
        while ((ident >>= 7) > 0)
          objid[offset--] = 128 | ident & 127;
      }
      return this._createEncoderBuffer(objid);
    };
    function two(num) {
      if (num < 10)
        return "0" + num;
      else
        return num;
    }
    DERNode.prototype._encodeTime = function encodeTime(time, tag) {
      let str;
      const date = new Date(time);
      if (tag === "gentime") {
        str = [
          two(date.getUTCFullYear()),
          two(date.getUTCMonth() + 1),
          two(date.getUTCDate()),
          two(date.getUTCHours()),
          two(date.getUTCMinutes()),
          two(date.getUTCSeconds()),
          "Z"
        ].join("");
      } else if (tag === "utctime") {
        str = [
          two(date.getUTCFullYear() % 100),
          two(date.getUTCMonth() + 1),
          two(date.getUTCDate()),
          two(date.getUTCHours()),
          two(date.getUTCMinutes()),
          two(date.getUTCSeconds()),
          "Z"
        ].join("");
      } else {
        this.reporter.error("Encoding " + tag + " time is not supported yet");
      }
      return this._encodeStr(str, "octstr");
    };
    DERNode.prototype._encodeNull = function encodeNull() {
      return this._createEncoderBuffer("");
    };
    DERNode.prototype._encodeInt = function encodeInt(num, values) {
      if (typeof num === "string") {
        if (!values)
          return this.reporter.error("String int or enum given, but no values map");
        if (!values.hasOwnProperty(num)) {
          return this.reporter.error("Values map doesn't contain: " + JSON.stringify(num));
        }
        num = values[num];
      }
      if (typeof num !== "number" && !Buffer2.isBuffer(num)) {
        const numArray = num.toArray();
        if (!num.sign && numArray[0] & 128) {
          numArray.unshift(0);
        }
        num = Buffer2.from(numArray);
      }
      if (Buffer2.isBuffer(num)) {
        let size2 = num.length;
        if (num.length === 0)
          size2++;
        const out2 = Buffer2.alloc(size2);
        num.copy(out2);
        if (num.length === 0)
          out2[0] = 0;
        return this._createEncoderBuffer(out2);
      }
      if (num < 128)
        return this._createEncoderBuffer(num);
      if (num < 256)
        return this._createEncoderBuffer([0, num]);
      let size = 1;
      for (let i = num; i >= 256; i >>= 8)
        size++;
      const out = new Array(size);
      for (let i = out.length - 1; i >= 0; i--) {
        out[i] = num & 255;
        num >>= 8;
      }
      if (out[0] & 128) {
        out.unshift(0);
      }
      return this._createEncoderBuffer(Buffer2.from(out));
    };
    DERNode.prototype._encodeBool = function encodeBool(value) {
      return this._createEncoderBuffer(value ? 255 : 0);
    };
    DERNode.prototype._use = function use2(entity, obj) {
      if (typeof entity === "function")
        entity = entity(obj);
      return entity._getEncoder("der").tree;
    };
    DERNode.prototype._skipDefault = function skipDefault(dataBuffer, reporter, parent) {
      const state = this._baseState;
      let i;
      if (state["default"] === null)
        return false;
      const data = dataBuffer.join();
      if (state.defaultBuffer === void 0)
        state.defaultBuffer = this._encodeValue(state["default"], reporter, parent).join();
      if (data.length !== state.defaultBuffer.length)
        return false;
      for (i = 0; i < data.length; i++)
        if (data[i] !== state.defaultBuffer[i])
          return false;
      return true;
    };
    function encodeTag(tag, primitive, cls, reporter) {
      let res;
      if (tag === "seqof")
        tag = "seq";
      else if (tag === "setof")
        tag = "set";
      if (der.tagByName.hasOwnProperty(tag))
        res = der.tagByName[tag];
      else if (typeof tag === "number" && (tag | 0) === tag)
        res = tag;
      else
        return reporter.error("Unknown tag: " + tag);
      if (res >= 31)
        return reporter.error("Multi-octet tag encoding unsupported");
      if (!primitive)
        res |= 32;
      res |= der.tagClassByName[cls || "universal"] << 6;
      return res;
    }
  }
});

// node_modules/asn1.js/lib/asn1/encoders/pem.js
var require_pem = __commonJS({
  "node_modules/asn1.js/lib/asn1/encoders/pem.js"(exports, module) {
    "use strict";
    var inherits = require_inherits();
    var DEREncoder = require_der2();
    function PEMEncoder(entity) {
      DEREncoder.call(this, entity);
      this.enc = "pem";
    }
    inherits(PEMEncoder, DEREncoder);
    module.exports = PEMEncoder;
    PEMEncoder.prototype.encode = function encode(data, options) {
      const buf = DEREncoder.prototype.encode.call(this, data);
      const p = buf.toString("base64");
      const out = ["-----BEGIN " + options.label + "-----"];
      for (let i = 0; i < p.length; i += 64)
        out.push(p.slice(i, i + 64));
      out.push("-----END " + options.label + "-----");
      return out.join("\n");
    };
  }
});

// node_modules/asn1.js/lib/asn1/encoders/index.js
var require_encoders = __commonJS({
  "node_modules/asn1.js/lib/asn1/encoders/index.js"(exports) {
    "use strict";
    var encoders = exports;
    encoders.der = require_der2();
    encoders.pem = require_pem();
  }
});

// node_modules/asn1.js/lib/asn1/decoders/der.js
var require_der3 = __commonJS({
  "node_modules/asn1.js/lib/asn1/decoders/der.js"(exports, module) {
    "use strict";
    var inherits = require_inherits();
    var bignum = require_bn();
    var DecoderBuffer = require_buffer().DecoderBuffer;
    var Node = require_node();
    var der = require_der();
    function DERDecoder(entity) {
      this.enc = "der";
      this.name = entity.name;
      this.entity = entity;
      this.tree = new DERNode();
      this.tree._init(entity.body);
    }
    module.exports = DERDecoder;
    DERDecoder.prototype.decode = function decode(data, options) {
      if (!DecoderBuffer.isDecoderBuffer(data)) {
        data = new DecoderBuffer(data, options);
      }
      return this.tree._decode(data, options);
    };
    function DERNode(parent) {
      Node.call(this, "der", parent);
    }
    inherits(DERNode, Node);
    DERNode.prototype._peekTag = function peekTag(buffer, tag, any) {
      if (buffer.isEmpty())
        return false;
      const state = buffer.save();
      const decodedTag = derDecodeTag(buffer, 'Failed to peek tag: "' + tag + '"');
      if (buffer.isError(decodedTag))
        return decodedTag;
      buffer.restore(state);
      return decodedTag.tag === tag || decodedTag.tagStr === tag || decodedTag.tagStr + "of" === tag || any;
    };
    DERNode.prototype._decodeTag = function decodeTag(buffer, tag, any) {
      const decodedTag = derDecodeTag(
        buffer,
        'Failed to decode tag of "' + tag + '"'
      );
      if (buffer.isError(decodedTag))
        return decodedTag;
      let len = derDecodeLen(
        buffer,
        decodedTag.primitive,
        'Failed to get length of "' + tag + '"'
      );
      if (buffer.isError(len))
        return len;
      if (!any && decodedTag.tag !== tag && decodedTag.tagStr !== tag && decodedTag.tagStr + "of" !== tag) {
        return buffer.error('Failed to match tag: "' + tag + '"');
      }
      if (decodedTag.primitive || len !== null)
        return buffer.skip(len, 'Failed to match body of: "' + tag + '"');
      const state = buffer.save();
      const res = this._skipUntilEnd(
        buffer,
        'Failed to skip indefinite length body: "' + this.tag + '"'
      );
      if (buffer.isError(res))
        return res;
      len = buffer.offset - state.offset;
      buffer.restore(state);
      return buffer.skip(len, 'Failed to match body of: "' + tag + '"');
    };
    DERNode.prototype._skipUntilEnd = function skipUntilEnd(buffer, fail) {
      for (; ; ) {
        const tag = derDecodeTag(buffer, fail);
        if (buffer.isError(tag))
          return tag;
        const len = derDecodeLen(buffer, tag.primitive, fail);
        if (buffer.isError(len))
          return len;
        let res;
        if (tag.primitive || len !== null)
          res = buffer.skip(len);
        else
          res = this._skipUntilEnd(buffer, fail);
        if (buffer.isError(res))
          return res;
        if (tag.tagStr === "end")
          break;
      }
    };
    DERNode.prototype._decodeList = function decodeList(buffer, tag, decoder, options) {
      const result = [];
      while (!buffer.isEmpty()) {
        const possibleEnd = this._peekTag(buffer, "end");
        if (buffer.isError(possibleEnd))
          return possibleEnd;
        const res = decoder.decode(buffer, "der", options);
        if (buffer.isError(res) && possibleEnd)
          break;
        result.push(res);
      }
      return result;
    };
    DERNode.prototype._decodeStr = function decodeStr(buffer, tag) {
      if (tag === "bitstr") {
        const unused = buffer.readUInt8();
        if (buffer.isError(unused))
          return unused;
        return { unused, data: buffer.raw() };
      } else if (tag === "bmpstr") {
        const raw = buffer.raw();
        if (raw.length % 2 === 1)
          return buffer.error("Decoding of string type: bmpstr length mismatch");
        let str = "";
        for (let i = 0; i < raw.length / 2; i++) {
          str += String.fromCharCode(raw.readUInt16BE(i * 2));
        }
        return str;
      } else if (tag === "numstr") {
        const numstr = buffer.raw().toString("ascii");
        if (!this._isNumstr(numstr)) {
          return buffer.error("Decoding of string type: numstr unsupported characters");
        }
        return numstr;
      } else if (tag === "octstr") {
        return buffer.raw();
      } else if (tag === "objDesc") {
        return buffer.raw();
      } else if (tag === "printstr") {
        const printstr = buffer.raw().toString("ascii");
        if (!this._isPrintstr(printstr)) {
          return buffer.error("Decoding of string type: printstr unsupported characters");
        }
        return printstr;
      } else if (/str$/.test(tag)) {
        return buffer.raw().toString();
      } else {
        return buffer.error("Decoding of string type: " + tag + " unsupported");
      }
    };
    DERNode.prototype._decodeObjid = function decodeObjid(buffer, values, relative) {
      let result;
      const identifiers = [];
      let ident = 0;
      let subident = 0;
      while (!buffer.isEmpty()) {
        subident = buffer.readUInt8();
        ident <<= 7;
        ident |= subident & 127;
        if ((subident & 128) === 0) {
          identifiers.push(ident);
          ident = 0;
        }
      }
      if (subident & 128)
        identifiers.push(ident);
      const first = identifiers[0] / 40 | 0;
      const second = identifiers[0] % 40;
      if (relative)
        result = identifiers;
      else
        result = [first, second].concat(identifiers.slice(1));
      if (values) {
        let tmp = values[result.join(" ")];
        if (tmp === void 0)
          tmp = values[result.join(".")];
        if (tmp !== void 0)
          result = tmp;
      }
      return result;
    };
    DERNode.prototype._decodeTime = function decodeTime(buffer, tag) {
      const str = buffer.raw().toString();
      let year;
      let mon;
      let day;
      let hour;
      let min;
      let sec;
      if (tag === "gentime") {
        year = str.slice(0, 4) | 0;
        mon = str.slice(4, 6) | 0;
        day = str.slice(6, 8) | 0;
        hour = str.slice(8, 10) | 0;
        min = str.slice(10, 12) | 0;
        sec = str.slice(12, 14) | 0;
      } else if (tag === "utctime") {
        year = str.slice(0, 2) | 0;
        mon = str.slice(2, 4) | 0;
        day = str.slice(4, 6) | 0;
        hour = str.slice(6, 8) | 0;
        min = str.slice(8, 10) | 0;
        sec = str.slice(10, 12) | 0;
        if (year < 70)
          year = 2e3 + year;
        else
          year = 1900 + year;
      } else {
        return buffer.error("Decoding " + tag + " time is not supported yet");
      }
      return Date.UTC(year, mon - 1, day, hour, min, sec, 0);
    };
    DERNode.prototype._decodeNull = function decodeNull() {
      return null;
    };
    DERNode.prototype._decodeBool = function decodeBool(buffer) {
      const res = buffer.readUInt8();
      if (buffer.isError(res))
        return res;
      else
        return res !== 0;
    };
    DERNode.prototype._decodeInt = function decodeInt(buffer, values) {
      const raw = buffer.raw();
      let res = new bignum(raw);
      if (values)
        res = values[res.toString(10)] || res;
      return res;
    };
    DERNode.prototype._use = function use2(entity, obj) {
      if (typeof entity === "function")
        entity = entity(obj);
      return entity._getDecoder("der").tree;
    };
    function derDecodeTag(buf, fail) {
      let tag = buf.readUInt8(fail);
      if (buf.isError(tag))
        return tag;
      const cls = der.tagClass[tag >> 6];
      const primitive = (tag & 32) === 0;
      if ((tag & 31) === 31) {
        let oct = tag;
        tag = 0;
        while ((oct & 128) === 128) {
          oct = buf.readUInt8(fail);
          if (buf.isError(oct))
            return oct;
          tag <<= 7;
          tag |= oct & 127;
        }
      } else {
        tag &= 31;
      }
      const tagStr = der.tag[tag];
      return {
        cls,
        primitive,
        tag,
        tagStr
      };
    }
    function derDecodeLen(buf, primitive, fail) {
      let len = buf.readUInt8(fail);
      if (buf.isError(len))
        return len;
      if (!primitive && len === 128)
        return null;
      if ((len & 128) === 0) {
        return len;
      }
      const num = len & 127;
      if (num > 4)
        return buf.error("length octect is too long");
      len = 0;
      for (let i = 0; i < num; i++) {
        len <<= 8;
        const j = buf.readUInt8(fail);
        if (buf.isError(j))
          return j;
        len |= j;
      }
      return len;
    }
  }
});

// node_modules/asn1.js/lib/asn1/decoders/pem.js
var require_pem2 = __commonJS({
  "node_modules/asn1.js/lib/asn1/decoders/pem.js"(exports, module) {
    "use strict";
    var inherits = require_inherits();
    var Buffer2 = require_safer().Buffer;
    var DERDecoder = require_der3();
    function PEMDecoder(entity) {
      DERDecoder.call(this, entity);
      this.enc = "pem";
    }
    inherits(PEMDecoder, DERDecoder);
    module.exports = PEMDecoder;
    PEMDecoder.prototype.decode = function decode(data, options) {
      const lines = data.toString().split(/[\r\n]+/g);
      const label = options.label.toUpperCase();
      const re = /^-----(BEGIN|END) ([^-]+)-----$/;
      let start = -1;
      let end = -1;
      for (let i = 0; i < lines.length; i++) {
        const match = lines[i].match(re);
        if (match === null)
          continue;
        if (match[2] !== label)
          continue;
        if (start === -1) {
          if (match[1] !== "BEGIN")
            break;
          start = i;
        } else {
          if (match[1] !== "END")
            break;
          end = i;
          break;
        }
      }
      if (start === -1 || end === -1)
        throw new Error("PEM section not found for: " + label);
      const base64 = lines.slice(start + 1, end).join("");
      base64.replace(/[^a-z0-9+/=]+/gi, "");
      const input = Buffer2.from(base64, "base64");
      return DERDecoder.prototype.decode.call(this, input, options);
    };
  }
});

// node_modules/asn1.js/lib/asn1/decoders/index.js
var require_decoders = __commonJS({
  "node_modules/asn1.js/lib/asn1/decoders/index.js"(exports) {
    "use strict";
    var decoders = exports;
    decoders.der = require_der3();
    decoders.pem = require_pem2();
  }
});

// node_modules/asn1.js/lib/asn1/api.js
var require_api = __commonJS({
  "node_modules/asn1.js/lib/asn1/api.js"(exports) {
    "use strict";
    var encoders = require_encoders();
    var decoders = require_decoders();
    var inherits = require_inherits();
    var api = exports;
    api.define = function define(name, body) {
      return new Entity(name, body);
    };
    function Entity(name, body) {
      this.name = name;
      this.body = body;
      this.decoders = {};
      this.encoders = {};
    }
    Entity.prototype._createNamed = function createNamed(Base) {
      const name = this.name;
      function Generated(entity) {
        this._initNamed(entity, name);
      }
      inherits(Generated, Base);
      Generated.prototype._initNamed = function _initNamed(entity, name2) {
        Base.call(this, entity, name2);
      };
      return new Generated(this);
    };
    Entity.prototype._getDecoder = function _getDecoder(enc) {
      enc = enc || "der";
      if (!this.decoders.hasOwnProperty(enc))
        this.decoders[enc] = this._createNamed(decoders[enc]);
      return this.decoders[enc];
    };
    Entity.prototype.decode = function decode(data, enc, options) {
      return this._getDecoder(enc).decode(data, options);
    };
    Entity.prototype._getEncoder = function _getEncoder(enc) {
      enc = enc || "der";
      if (!this.encoders.hasOwnProperty(enc))
        this.encoders[enc] = this._createNamed(encoders[enc]);
      return this.encoders[enc];
    };
    Entity.prototype.encode = function encode(data, enc, reporter) {
      return this._getEncoder(enc).encode(data, reporter);
    };
  }
});

// node_modules/asn1.js/lib/asn1/base/index.js
var require_base = __commonJS({
  "node_modules/asn1.js/lib/asn1/base/index.js"(exports) {
    "use strict";
    var base = exports;
    base.Reporter = require_reporter().Reporter;
    base.DecoderBuffer = require_buffer().DecoderBuffer;
    base.EncoderBuffer = require_buffer().EncoderBuffer;
    base.Node = require_node();
  }
});

// node_modules/asn1.js/lib/asn1/constants/index.js
var require_constants = __commonJS({
  "node_modules/asn1.js/lib/asn1/constants/index.js"(exports) {
    "use strict";
    var constants = exports;
    constants._reverse = function reverse(map) {
      const res = {};
      Object.keys(map).forEach(function(key) {
        if ((key | 0) == key)
          key = key | 0;
        const value = map[key];
        res[value] = key;
      });
      return res;
    };
    constants.der = require_der();
  }
});

// node_modules/asn1.js/lib/asn1.js
var require_asn1 = __commonJS({
  "node_modules/asn1.js/lib/asn1.js"(exports) {
    "use strict";
    var asn1 = exports;
    asn1.bignum = require_bn();
    asn1.define = require_api().define;
    asn1.base = require_base();
    asn1.constants = require_constants();
    asn1.decoders = require_decoders();
    asn1.encoders = require_encoders();
  }
});

// node_modules/safe-buffer/index.js
var require_safe_buffer = __commonJS({
  "node_modules/safe-buffer/index.js"(exports, module) {
    var buffer = __require("buffer");
    var Buffer2 = buffer.Buffer;
    function copyProps(src, dst) {
      for (var key in src) {
        dst[key] = src[key];
      }
    }
    if (Buffer2.from && Buffer2.alloc && Buffer2.allocUnsafe && Buffer2.allocUnsafeSlow) {
      module.exports = buffer;
    } else {
      copyProps(buffer, exports);
      exports.Buffer = SafeBuffer;
    }
    function SafeBuffer(arg, encodingOrOffset, length) {
      return Buffer2(arg, encodingOrOffset, length);
    }
    SafeBuffer.prototype = Object.create(Buffer2.prototype);
    copyProps(Buffer2, SafeBuffer);
    SafeBuffer.from = function(arg, encodingOrOffset, length) {
      if (typeof arg === "number") {
        throw new TypeError("Argument must not be a number");
      }
      return Buffer2(arg, encodingOrOffset, length);
    };
    SafeBuffer.alloc = function(size, fill, encoding) {
      if (typeof size !== "number") {
        throw new TypeError("Argument must be a number");
      }
      var buf = Buffer2(size);
      if (fill !== void 0) {
        if (typeof encoding === "string") {
          buf.fill(fill, encoding);
        } else {
          buf.fill(fill);
        }
      } else {
        buf.fill(0);
      }
      return buf;
    };
    SafeBuffer.allocUnsafe = function(size) {
      if (typeof size !== "number") {
        throw new TypeError("Argument must be a number");
      }
      return Buffer2(size);
    };
    SafeBuffer.allocUnsafeSlow = function(size) {
      if (typeof size !== "number") {
        throw new TypeError("Argument must be a number");
      }
      return buffer.SlowBuffer(size);
    };
  }
});

// node_modules/jws/lib/data-stream.js
var require_data_stream = __commonJS({
  "node_modules/jws/lib/data-stream.js"(exports, module) {
    var Buffer2 = require_safe_buffer().Buffer;
    var Stream = __require("stream");
    var util = __require("util");
    function DataStream(data) {
      this.buffer = null;
      this.writable = true;
      this.readable = true;
      if (!data) {
        this.buffer = Buffer2.alloc(0);
        return this;
      }
      if (typeof data.pipe === "function") {
        this.buffer = Buffer2.alloc(0);
        data.pipe(this);
        return this;
      }
      if (data.length || typeof data === "object") {
        this.buffer = data;
        this.writable = false;
        process.nextTick(function() {
          this.emit("end", data);
          this.readable = false;
          this.emit("close");
        }.bind(this));
        return this;
      }
      throw new TypeError("Unexpected data type (" + typeof data + ")");
    }
    util.inherits(DataStream, Stream);
    DataStream.prototype.write = function write(data) {
      this.buffer = Buffer2.concat([this.buffer, Buffer2.from(data)]);
      this.emit("data", data);
    };
    DataStream.prototype.end = function end(data) {
      if (data)
        this.write(data);
      this.emit("end", data);
      this.emit("close");
      this.writable = false;
      this.readable = false;
    };
    module.exports = DataStream;
  }
});

// node_modules/buffer-equal-constant-time/index.js
var require_buffer_equal_constant_time = __commonJS({
  "node_modules/buffer-equal-constant-time/index.js"(exports, module) {
    "use strict";
    var Buffer2 = __require("buffer").Buffer;
    var SlowBuffer = __require("buffer").SlowBuffer;
    module.exports = bufferEq;
    function bufferEq(a, b) {
      if (!Buffer2.isBuffer(a) || !Buffer2.isBuffer(b)) {
        return false;
      }
      if (a.length !== b.length) {
        return false;
      }
      var c = 0;
      for (var i = 0; i < a.length; i++) {
        c |= a[i] ^ b[i];
      }
      return c === 0;
    }
    bufferEq.install = function() {
      Buffer2.prototype.equal = SlowBuffer.prototype.equal = function equal(that) {
        return bufferEq(this, that);
      };
    };
    var origBufEqual = Buffer2.prototype.equal;
    var origSlowBufEqual = SlowBuffer.prototype.equal;
    bufferEq.restore = function() {
      Buffer2.prototype.equal = origBufEqual;
      SlowBuffer.prototype.equal = origSlowBufEqual;
    };
  }
});

// node_modules/ecdsa-sig-formatter/src/param-bytes-for-alg.js
var require_param_bytes_for_alg = __commonJS({
  "node_modules/ecdsa-sig-formatter/src/param-bytes-for-alg.js"(exports, module) {
    "use strict";
    function getParamSize(keySize) {
      var result = (keySize / 8 | 0) + (keySize % 8 === 0 ? 0 : 1);
      return result;
    }
    var paramBytesForAlg = {
      ES256: getParamSize(256),
      ES384: getParamSize(384),
      ES512: getParamSize(521)
    };
    function getParamBytesForAlg(alg) {
      var paramBytes = paramBytesForAlg[alg];
      if (paramBytes) {
        return paramBytes;
      }
      throw new Error('Unknown algorithm "' + alg + '"');
    }
    module.exports = getParamBytesForAlg;
  }
});

// node_modules/ecdsa-sig-formatter/src/ecdsa-sig-formatter.js
var require_ecdsa_sig_formatter = __commonJS({
  "node_modules/ecdsa-sig-formatter/src/ecdsa-sig-formatter.js"(exports, module) {
    "use strict";
    var Buffer2 = require_safe_buffer().Buffer;
    var getParamBytesForAlg = require_param_bytes_for_alg();
    var MAX_OCTET = 128;
    var CLASS_UNIVERSAL = 0;
    var PRIMITIVE_BIT = 32;
    var TAG_SEQ = 16;
    var TAG_INT = 2;
    var ENCODED_TAG_SEQ = TAG_SEQ | PRIMITIVE_BIT | CLASS_UNIVERSAL << 6;
    var ENCODED_TAG_INT = TAG_INT | CLASS_UNIVERSAL << 6;
    function base64Url(base64) {
      return base64.replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
    }
    function signatureAsBuffer(signature) {
      if (Buffer2.isBuffer(signature)) {
        return signature;
      } else if ("string" === typeof signature) {
        return Buffer2.from(signature, "base64");
      }
      throw new TypeError("ECDSA signature must be a Base64 string or a Buffer");
    }
    function derToJose(signature, alg) {
      signature = signatureAsBuffer(signature);
      var paramBytes = getParamBytesForAlg(alg);
      var maxEncodedParamLength = paramBytes + 1;
      var inputLength = signature.length;
      var offset = 0;
      if (signature[offset++] !== ENCODED_TAG_SEQ) {
        throw new Error('Could not find expected "seq"');
      }
      var seqLength = signature[offset++];
      if (seqLength === (MAX_OCTET | 1)) {
        seqLength = signature[offset++];
      }
      if (inputLength - offset < seqLength) {
        throw new Error('"seq" specified length of "' + seqLength + '", only "' + (inputLength - offset) + '" remaining');
      }
      if (signature[offset++] !== ENCODED_TAG_INT) {
        throw new Error('Could not find expected "int" for "r"');
      }
      var rLength = signature[offset++];
      if (inputLength - offset - 2 < rLength) {
        throw new Error('"r" specified length of "' + rLength + '", only "' + (inputLength - offset - 2) + '" available');
      }
      if (maxEncodedParamLength < rLength) {
        throw new Error('"r" specified length of "' + rLength + '", max of "' + maxEncodedParamLength + '" is acceptable');
      }
      var rOffset = offset;
      offset += rLength;
      if (signature[offset++] !== ENCODED_TAG_INT) {
        throw new Error('Could not find expected "int" for "s"');
      }
      var sLength = signature[offset++];
      if (inputLength - offset !== sLength) {
        throw new Error('"s" specified length of "' + sLength + '", expected "' + (inputLength - offset) + '"');
      }
      if (maxEncodedParamLength < sLength) {
        throw new Error('"s" specified length of "' + sLength + '", max of "' + maxEncodedParamLength + '" is acceptable');
      }
      var sOffset = offset;
      offset += sLength;
      if (offset !== inputLength) {
        throw new Error('Expected to consume entire buffer, but "' + (inputLength - offset) + '" bytes remain');
      }
      var rPadding = paramBytes - rLength, sPadding = paramBytes - sLength;
      var dst = Buffer2.allocUnsafe(rPadding + rLength + sPadding + sLength);
      for (offset = 0; offset < rPadding; ++offset) {
        dst[offset] = 0;
      }
      signature.copy(dst, offset, rOffset + Math.max(-rPadding, 0), rOffset + rLength);
      offset = paramBytes;
      for (var o = offset; offset < o + sPadding; ++offset) {
        dst[offset] = 0;
      }
      signature.copy(dst, offset, sOffset + Math.max(-sPadding, 0), sOffset + sLength);
      dst = dst.toString("base64");
      dst = base64Url(dst);
      return dst;
    }
    function countPadding(buf, start, stop) {
      var padding = 0;
      while (start + padding < stop && buf[start + padding] === 0) {
        ++padding;
      }
      var needsSign = buf[start + padding] >= MAX_OCTET;
      if (needsSign) {
        --padding;
      }
      return padding;
    }
    function joseToDer(signature, alg) {
      signature = signatureAsBuffer(signature);
      var paramBytes = getParamBytesForAlg(alg);
      var signatureBytes = signature.length;
      if (signatureBytes !== paramBytes * 2) {
        throw new TypeError('"' + alg + '" signatures must be "' + paramBytes * 2 + '" bytes, saw "' + signatureBytes + '"');
      }
      var rPadding = countPadding(signature, 0, paramBytes);
      var sPadding = countPadding(signature, paramBytes, signature.length);
      var rLength = paramBytes - rPadding;
      var sLength = paramBytes - sPadding;
      var rsBytes = 1 + 1 + rLength + 1 + 1 + sLength;
      var shortLength = rsBytes < MAX_OCTET;
      var dst = Buffer2.allocUnsafe((shortLength ? 2 : 3) + rsBytes);
      var offset = 0;
      dst[offset++] = ENCODED_TAG_SEQ;
      if (shortLength) {
        dst[offset++] = rsBytes;
      } else {
        dst[offset++] = MAX_OCTET | 1;
        dst[offset++] = rsBytes & 255;
      }
      dst[offset++] = ENCODED_TAG_INT;
      dst[offset++] = rLength;
      if (rPadding < 0) {
        dst[offset++] = 0;
        offset += signature.copy(dst, offset, 0, paramBytes);
      } else {
        offset += signature.copy(dst, offset, rPadding, paramBytes);
      }
      dst[offset++] = ENCODED_TAG_INT;
      dst[offset++] = sLength;
      if (sPadding < 0) {
        dst[offset++] = 0;
        signature.copy(dst, offset, paramBytes);
      } else {
        signature.copy(dst, offset, paramBytes + sPadding);
      }
      return dst;
    }
    module.exports = {
      derToJose,
      joseToDer
    };
  }
});

// node_modules/jwa/index.js
var require_jwa = __commonJS({
  "node_modules/jwa/index.js"(exports, module) {
    var bufferEqual = require_buffer_equal_constant_time();
    var Buffer2 = require_safe_buffer().Buffer;
    var crypto2 = __require("crypto");
    var formatEcdsa = require_ecdsa_sig_formatter();
    var util = __require("util");
    var MSG_INVALID_ALGORITHM = '"%s" is not a valid algorithm.\n  Supported algorithms are:\n  "HS256", "HS384", "HS512", "RS256", "RS384", "RS512", "PS256", "PS384", "PS512", "ES256", "ES384", "ES512" and "none".';
    var MSG_INVALID_SECRET = "secret must be a string or buffer";
    var MSG_INVALID_VERIFIER_KEY = "key must be a string or a buffer";
    var MSG_INVALID_SIGNER_KEY = "key must be a string, a buffer or an object";
    var supportsKeyObjects = typeof crypto2.createPublicKey === "function";
    if (supportsKeyObjects) {
      MSG_INVALID_VERIFIER_KEY += " or a KeyObject";
      MSG_INVALID_SECRET += "or a KeyObject";
    }
    function checkIsPublicKey(key) {
      if (Buffer2.isBuffer(key)) {
        return;
      }
      if (typeof key === "string") {
        return;
      }
      if (!supportsKeyObjects) {
        throw typeError(MSG_INVALID_VERIFIER_KEY);
      }
      if (typeof key !== "object") {
        throw typeError(MSG_INVALID_VERIFIER_KEY);
      }
      if (typeof key.type !== "string") {
        throw typeError(MSG_INVALID_VERIFIER_KEY);
      }
      if (typeof key.asymmetricKeyType !== "string") {
        throw typeError(MSG_INVALID_VERIFIER_KEY);
      }
      if (typeof key.export !== "function") {
        throw typeError(MSG_INVALID_VERIFIER_KEY);
      }
    }
    function checkIsPrivateKey(key) {
      if (Buffer2.isBuffer(key)) {
        return;
      }
      if (typeof key === "string") {
        return;
      }
      if (typeof key === "object") {
        return;
      }
      throw typeError(MSG_INVALID_SIGNER_KEY);
    }
    function checkIsSecretKey(key) {
      if (Buffer2.isBuffer(key)) {
        return;
      }
      if (typeof key === "string") {
        return key;
      }
      if (!supportsKeyObjects) {
        throw typeError(MSG_INVALID_SECRET);
      }
      if (typeof key !== "object") {
        throw typeError(MSG_INVALID_SECRET);
      }
      if (key.type !== "secret") {
        throw typeError(MSG_INVALID_SECRET);
      }
      if (typeof key.export !== "function") {
        throw typeError(MSG_INVALID_SECRET);
      }
    }
    function fromBase64(base64) {
      return base64.replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
    }
    function toBase64(base64url) {
      base64url = base64url.toString();
      var padding = 4 - base64url.length % 4;
      if (padding !== 4) {
        for (var i = 0; i < padding; ++i) {
          base64url += "=";
        }
      }
      return base64url.replace(/\-/g, "+").replace(/_/g, "/");
    }
    function typeError(template) {
      var args = [].slice.call(arguments, 1);
      var errMsg = util.format.bind(util, template).apply(null, args);
      return new TypeError(errMsg);
    }
    function bufferOrString(obj) {
      return Buffer2.isBuffer(obj) || typeof obj === "string";
    }
    function normalizeInput(thing) {
      if (!bufferOrString(thing))
        thing = JSON.stringify(thing);
      return thing;
    }
    function createHmacSigner(bits) {
      return function sign(thing, secret) {
        checkIsSecretKey(secret);
        thing = normalizeInput(thing);
        var hmac = crypto2.createHmac("sha" + bits, secret);
        var sig = (hmac.update(thing), hmac.digest("base64"));
        return fromBase64(sig);
      };
    }
    function createHmacVerifier(bits) {
      return function verify(thing, signature, secret) {
        var computedSig = createHmacSigner(bits)(thing, secret);
        return bufferEqual(Buffer2.from(signature), Buffer2.from(computedSig));
      };
    }
    function createKeySigner(bits) {
      return function sign(thing, privateKey) {
        checkIsPrivateKey(privateKey);
        thing = normalizeInput(thing);
        var signer = crypto2.createSign("RSA-SHA" + bits);
        var sig = (signer.update(thing), signer.sign(privateKey, "base64"));
        return fromBase64(sig);
      };
    }
    function createKeyVerifier(bits) {
      return function verify(thing, signature, publicKey) {
        checkIsPublicKey(publicKey);
        thing = normalizeInput(thing);
        signature = toBase64(signature);
        var verifier = crypto2.createVerify("RSA-SHA" + bits);
        verifier.update(thing);
        return verifier.verify(publicKey, signature, "base64");
      };
    }
    function createPSSKeySigner(bits) {
      return function sign(thing, privateKey) {
        checkIsPrivateKey(privateKey);
        thing = normalizeInput(thing);
        var signer = crypto2.createSign("RSA-SHA" + bits);
        var sig = (signer.update(thing), signer.sign({
          key: privateKey,
          padding: crypto2.constants.RSA_PKCS1_PSS_PADDING,
          saltLength: crypto2.constants.RSA_PSS_SALTLEN_DIGEST
        }, "base64"));
        return fromBase64(sig);
      };
    }
    function createPSSKeyVerifier(bits) {
      return function verify(thing, signature, publicKey) {
        checkIsPublicKey(publicKey);
        thing = normalizeInput(thing);
        signature = toBase64(signature);
        var verifier = crypto2.createVerify("RSA-SHA" + bits);
        verifier.update(thing);
        return verifier.verify({
          key: publicKey,
          padding: crypto2.constants.RSA_PKCS1_PSS_PADDING,
          saltLength: crypto2.constants.RSA_PSS_SALTLEN_DIGEST
        }, signature, "base64");
      };
    }
    function createECDSASigner(bits) {
      var inner = createKeySigner(bits);
      return function sign() {
        var signature = inner.apply(null, arguments);
        signature = formatEcdsa.derToJose(signature, "ES" + bits);
        return signature;
      };
    }
    function createECDSAVerifer(bits) {
      var inner = createKeyVerifier(bits);
      return function verify(thing, signature, publicKey) {
        signature = formatEcdsa.joseToDer(signature, "ES" + bits).toString("base64");
        var result = inner(thing, signature, publicKey);
        return result;
      };
    }
    function createNoneSigner() {
      return function sign() {
        return "";
      };
    }
    function createNoneVerifier() {
      return function verify(thing, signature) {
        return signature === "";
      };
    }
    module.exports = function jwa(algorithm) {
      var signerFactories = {
        hs: createHmacSigner,
        rs: createKeySigner,
        ps: createPSSKeySigner,
        es: createECDSASigner,
        none: createNoneSigner
      };
      var verifierFactories = {
        hs: createHmacVerifier,
        rs: createKeyVerifier,
        ps: createPSSKeyVerifier,
        es: createECDSAVerifer,
        none: createNoneVerifier
      };
      var match = algorithm.match(/^(RS|PS|ES|HS)(256|384|512)$|^(none)$/);
      if (!match)
        throw typeError(MSG_INVALID_ALGORITHM, algorithm);
      var algo = (match[1] || match[3]).toLowerCase();
      var bits = match[2];
      return {
        sign: signerFactories[algo](bits),
        verify: verifierFactories[algo](bits)
      };
    };
  }
});

// node_modules/jws/lib/tostring.js
var require_tostring = __commonJS({
  "node_modules/jws/lib/tostring.js"(exports, module) {
    var Buffer2 = __require("buffer").Buffer;
    module.exports = function toString(obj) {
      if (typeof obj === "string")
        return obj;
      if (typeof obj === "number" || Buffer2.isBuffer(obj))
        return obj.toString();
      return JSON.stringify(obj);
    };
  }
});

// node_modules/jws/lib/sign-stream.js
var require_sign_stream = __commonJS({
  "node_modules/jws/lib/sign-stream.js"(exports, module) {
    var Buffer2 = require_safe_buffer().Buffer;
    var DataStream = require_data_stream();
    var jwa = require_jwa();
    var Stream = __require("stream");
    var toString = require_tostring();
    var util = __require("util");
    function base64url(string, encoding) {
      return Buffer2.from(string, encoding).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
    }
    function jwsSecuredInput(header, payload, encoding) {
      encoding = encoding || "utf8";
      var encodedHeader = base64url(toString(header), "binary");
      var encodedPayload = base64url(toString(payload), encoding);
      return util.format("%s.%s", encodedHeader, encodedPayload);
    }
    function jwsSign(opts) {
      var header = opts.header;
      var payload = opts.payload;
      var secretOrKey = opts.secret || opts.privateKey;
      var encoding = opts.encoding;
      var algo = jwa(header.alg);
      var securedInput = jwsSecuredInput(header, payload, encoding);
      var signature = algo.sign(securedInput, secretOrKey);
      return util.format("%s.%s", securedInput, signature);
    }
    function SignStream(opts) {
      var secret = opts.secret || opts.privateKey || opts.key;
      var secretStream = new DataStream(secret);
      this.readable = true;
      this.header = opts.header;
      this.encoding = opts.encoding;
      this.secret = this.privateKey = this.key = secretStream;
      this.payload = new DataStream(opts.payload);
      this.secret.once("close", function() {
        if (!this.payload.writable && this.readable)
          this.sign();
      }.bind(this));
      this.payload.once("close", function() {
        if (!this.secret.writable && this.readable)
          this.sign();
      }.bind(this));
    }
    util.inherits(SignStream, Stream);
    SignStream.prototype.sign = function sign() {
      try {
        var signature = jwsSign({
          header: this.header,
          payload: this.payload.buffer,
          secret: this.secret.buffer,
          encoding: this.encoding
        });
        this.emit("done", signature);
        this.emit("data", signature);
        this.emit("end");
        this.readable = false;
        return signature;
      } catch (e) {
        this.readable = false;
        this.emit("error", e);
        this.emit("close");
      }
    };
    SignStream.sign = jwsSign;
    module.exports = SignStream;
  }
});

// node_modules/jws/lib/verify-stream.js
var require_verify_stream = __commonJS({
  "node_modules/jws/lib/verify-stream.js"(exports, module) {
    var Buffer2 = require_safe_buffer().Buffer;
    var DataStream = require_data_stream();
    var jwa = require_jwa();
    var Stream = __require("stream");
    var toString = require_tostring();
    var util = __require("util");
    var JWS_REGEX = /^[a-zA-Z0-9\-_]+?\.[a-zA-Z0-9\-_]+?\.([a-zA-Z0-9\-_]+)?$/;
    function isObject(thing) {
      return Object.prototype.toString.call(thing) === "[object Object]";
    }
    function safeJsonParse(thing) {
      if (isObject(thing))
        return thing;
      try {
        return JSON.parse(thing);
      } catch (e) {
        return void 0;
      }
    }
    function headerFromJWS(jwsSig) {
      var encodedHeader = jwsSig.split(".", 1)[0];
      return safeJsonParse(Buffer2.from(encodedHeader, "base64").toString("binary"));
    }
    function securedInputFromJWS(jwsSig) {
      return jwsSig.split(".", 2).join(".");
    }
    function signatureFromJWS(jwsSig) {
      return jwsSig.split(".")[2];
    }
    function payloadFromJWS(jwsSig, encoding) {
      encoding = encoding || "utf8";
      var payload = jwsSig.split(".")[1];
      return Buffer2.from(payload, "base64").toString(encoding);
    }
    function isValidJws(string) {
      return JWS_REGEX.test(string) && !!headerFromJWS(string);
    }
    function jwsVerify(jwsSig, algorithm, secretOrKey) {
      if (!algorithm) {
        var err = new Error("Missing algorithm parameter for jws.verify");
        err.code = "MISSING_ALGORITHM";
        throw err;
      }
      jwsSig = toString(jwsSig);
      var signature = signatureFromJWS(jwsSig);
      var securedInput = securedInputFromJWS(jwsSig);
      var algo = jwa(algorithm);
      return algo.verify(securedInput, signature, secretOrKey);
    }
    function jwsDecode(jwsSig, opts) {
      opts = opts || {};
      jwsSig = toString(jwsSig);
      if (!isValidJws(jwsSig))
        return null;
      var header = headerFromJWS(jwsSig);
      if (!header)
        return null;
      var payload = payloadFromJWS(jwsSig);
      if (header.typ === "JWT" || opts.json)
        payload = JSON.parse(payload, opts.encoding);
      return {
        header,
        payload,
        signature: signatureFromJWS(jwsSig)
      };
    }
    function VerifyStream(opts) {
      opts = opts || {};
      var secretOrKey = opts.secret || opts.publicKey || opts.key;
      var secretStream = new DataStream(secretOrKey);
      this.readable = true;
      this.algorithm = opts.algorithm;
      this.encoding = opts.encoding;
      this.secret = this.publicKey = this.key = secretStream;
      this.signature = new DataStream(opts.signature);
      this.secret.once("close", function() {
        if (!this.signature.writable && this.readable)
          this.verify();
      }.bind(this));
      this.signature.once("close", function() {
        if (!this.secret.writable && this.readable)
          this.verify();
      }.bind(this));
    }
    util.inherits(VerifyStream, Stream);
    VerifyStream.prototype.verify = function verify() {
      try {
        var valid = jwsVerify(this.signature.buffer, this.algorithm, this.key.buffer);
        var obj = jwsDecode(this.signature.buffer, this.encoding);
        this.emit("done", valid, obj);
        this.emit("data", valid);
        this.emit("end");
        this.readable = false;
        return valid;
      } catch (e) {
        this.readable = false;
        this.emit("error", e);
        this.emit("close");
      }
    };
    VerifyStream.decode = jwsDecode;
    VerifyStream.isValid = isValidJws;
    VerifyStream.verify = jwsVerify;
    module.exports = VerifyStream;
  }
});

// node_modules/jws/index.js
var require_jws = __commonJS({
  "node_modules/jws/index.js"(exports) {
    var SignStream = require_sign_stream();
    var VerifyStream = require_verify_stream();
    var ALGORITHMS = [
      "HS256",
      "HS384",
      "HS512",
      "RS256",
      "RS384",
      "RS512",
      "PS256",
      "PS384",
      "PS512",
      "ES256",
      "ES384",
      "ES512"
    ];
    exports.ALGORITHMS = ALGORITHMS;
    exports.sign = SignStream.sign;
    exports.verify = VerifyStream.verify;
    exports.decode = VerifyStream.decode;
    exports.isValid = VerifyStream.isValid;
    exports.createSign = function createSign(opts) {
      return new SignStream(opts);
    };
    exports.createVerify = function createVerify(opts) {
      return new VerifyStream(opts);
    };
  }
});

// node_modules/web-push/src/web-push-constants.js
var require_web_push_constants = __commonJS({
  "node_modules/web-push/src/web-push-constants.js"(exports, module) {
    "use strict";
    var WebPushConstants = {};
    WebPushConstants.supportedContentEncodings = {
      AES_GCM: "aesgcm",
      AES_128_GCM: "aes128gcm"
    };
    WebPushConstants.supportedUrgency = {
      VERY_LOW: "very-low",
      LOW: "low",
      NORMAL: "normal",
      HIGH: "high"
    };
    module.exports = WebPushConstants;
  }
});

// node_modules/web-push/src/urlsafe-base64-helper.js
var require_urlsafe_base64_helper = __commonJS({
  "node_modules/web-push/src/urlsafe-base64-helper.js"(exports, module) {
    "use strict";
    function validate2(base64) {
      return /^[A-Za-z0-9\-_]+$/.test(base64);
    }
    module.exports = {
      validate: validate2
    };
  }
});

// node_modules/web-push/src/vapid-helper.js
var require_vapid_helper = __commonJS({
  "node_modules/web-push/src/vapid-helper.js"(exports, module) {
    "use strict";
    var crypto2 = __require("crypto");
    var asn1 = require_asn1();
    var jws = require_jws();
    var { URL: URL2 } = __require("url");
    var WebPushConstants = require_web_push_constants();
    var urlBase64Helper = require_urlsafe_base64_helper();
    var DEFAULT_EXPIRATION_SECONDS = 12 * 60 * 60;
    var MAX_EXPIRATION_SECONDS = 24 * 60 * 60;
    var ECPrivateKeyASN = asn1.define("ECPrivateKey", function() {
      this.seq().obj(
        this.key("version").int(),
        this.key("privateKey").octstr(),
        this.key("parameters").explicit(0).objid().optional(),
        this.key("publicKey").explicit(1).bitstr().optional()
      );
    });
    function toPEM(key) {
      return ECPrivateKeyASN.encode({
        version: 1,
        privateKey: key,
        parameters: [1, 2, 840, 10045, 3, 1, 7]
        // prime256v1
      }, "pem", {
        label: "EC PRIVATE KEY"
      });
    }
    function generateVAPIDKeys() {
      const curve = crypto2.createECDH("prime256v1");
      curve.generateKeys();
      let publicKeyBuffer = curve.getPublicKey();
      let privateKeyBuffer = curve.getPrivateKey();
      if (privateKeyBuffer.length < 32) {
        const padding = Buffer.alloc(32 - privateKeyBuffer.length);
        padding.fill(0);
        privateKeyBuffer = Buffer.concat([padding, privateKeyBuffer]);
      }
      if (publicKeyBuffer.length < 65) {
        const padding = Buffer.alloc(65 - publicKeyBuffer.length);
        padding.fill(0);
        publicKeyBuffer = Buffer.concat([padding, publicKeyBuffer]);
      }
      return {
        publicKey: publicKeyBuffer.toString("base64url"),
        privateKey: privateKeyBuffer.toString("base64url")
      };
    }
    function validateSubject(subject) {
      if (!subject) {
        throw new Error("No subject set in vapidDetails.subject.");
      }
      if (typeof subject !== "string" || subject.length === 0) {
        throw new Error("The subject value must be a string containing an https: URL or mailto: address. " + subject);
      }
      try {
        const subjectParseResult = new URL2(subject);
        if (!["https:", "mailto:"].includes(subjectParseResult.protocol)) {
          throw new Error("Vapid subject is not an https: or mailto: URL. " + subject);
        }
        if (subjectParseResult.hostname === "localhost") {
          console.warn("Vapid subject points to a localhost web URI, which is unsupported by Apple's push notification server and will result in a BadJwtToken error when sending notifications.");
        }
      } catch (err) {
        throw new Error("Vapid subject is not a valid URL. " + subject);
      }
    }
    function validatePublicKey(publicKey) {
      if (!publicKey) {
        throw new Error("No key set vapidDetails.publicKey");
      }
      if (typeof publicKey !== "string") {
        throw new Error("Vapid public key is must be a URL safe Base 64 encoded string.");
      }
      if (!urlBase64Helper.validate(publicKey)) {
        throw new Error('Vapid public key must be a URL safe Base 64 (without "=")');
      }
      publicKey = Buffer.from(publicKey, "base64url");
      if (publicKey.length !== 65) {
        throw new Error("Vapid public key should be 65 bytes long when decoded.");
      }
    }
    function validatePrivateKey(privateKey) {
      if (!privateKey) {
        throw new Error("No key set in vapidDetails.privateKey");
      }
      if (typeof privateKey !== "string") {
        throw new Error("Vapid private key must be a URL safe Base 64 encoded string.");
      }
      if (!urlBase64Helper.validate(privateKey)) {
        throw new Error('Vapid private key must be a URL safe Base 64 (without "=")');
      }
      privateKey = Buffer.from(privateKey, "base64url");
      if (privateKey.length !== 32) {
        throw new Error("Vapid private key should be 32 bytes long when decoded.");
      }
    }
    function getFutureExpirationTimestamp(numSeconds) {
      const futureExp = /* @__PURE__ */ new Date();
      futureExp.setSeconds(futureExp.getSeconds() + numSeconds);
      return Math.floor(futureExp.getTime() / 1e3);
    }
    function validateExpiration(expiration) {
      if (!Number.isInteger(expiration)) {
        throw new Error("`expiration` value must be a number");
      }
      if (expiration < 0) {
        throw new Error("`expiration` must be a positive integer");
      }
      const maxExpirationTimestamp = getFutureExpirationTimestamp(MAX_EXPIRATION_SECONDS);
      if (expiration >= maxExpirationTimestamp) {
        throw new Error("`expiration` value is greater than maximum of 24 hours");
      }
    }
    function getVapidHeaders(audience, subject, publicKey, privateKey, contentEncoding, expiration) {
      if (!audience) {
        throw new Error("No audience could be generated for VAPID.");
      }
      if (typeof audience !== "string" || audience.length === 0) {
        throw new Error("The audience value must be a string containing the origin of a push service. " + audience);
      }
      try {
        new URL2(audience);
      } catch (err) {
        throw new Error("VAPID audience is not a url. " + audience);
      }
      validateSubject(subject);
      validatePublicKey(publicKey);
      validatePrivateKey(privateKey);
      privateKey = Buffer.from(privateKey, "base64url");
      if (expiration) {
        validateExpiration(expiration);
      } else {
        expiration = getFutureExpirationTimestamp(DEFAULT_EXPIRATION_SECONDS);
      }
      const header = {
        typ: "JWT",
        alg: "ES256"
      };
      const jwtPayload = {
        aud: audience,
        exp: expiration,
        sub: subject
      };
      const jwt = jws.sign({
        header,
        payload: jwtPayload,
        privateKey: toPEM(privateKey)
      });
      if (contentEncoding === WebPushConstants.supportedContentEncodings.AES_128_GCM) {
        return {
          Authorization: "vapid t=" + jwt + ", k=" + publicKey
        };
      }
      if (contentEncoding === WebPushConstants.supportedContentEncodings.AES_GCM) {
        return {
          Authorization: "WebPush " + jwt,
          "Crypto-Key": "p256ecdsa=" + publicKey
        };
      }
      throw new Error("Unsupported encoding type specified.");
    }
    module.exports = {
      generateVAPIDKeys,
      getFutureExpirationTimestamp,
      getVapidHeaders,
      validateSubject,
      validatePublicKey,
      validatePrivateKey,
      validateExpiration
    };
  }
});

// node_modules/urlsafe-base64/lib/urlsafe-base64.js
var require_urlsafe_base64 = __commonJS({
  "node_modules/urlsafe-base64/lib/urlsafe-base64.js"(exports) {
    exports.version = "1.0.0";
    exports.encode = function encode(buffer) {
      return buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    };
    exports.decode = function decode(base64) {
      base64 += Array(5 - base64.length % 4).join("=");
      base64 = base64.replace(/\-/g, "+").replace(/\_/g, "/");
      return new Buffer(base64, "base64");
    };
    exports.validate = function validate2(base64) {
      return /^[A-Za-z0-9\-_]+$/.test(base64);
    };
  }
});

// node_modules/urlsafe-base64/index.js
var require_urlsafe_base642 = __commonJS({
  "node_modules/urlsafe-base64/index.js"(exports, module) {
    module.exports = require_urlsafe_base64();
  }
});

// node_modules/http_ece/ece.js
var require_ece = __commonJS({
  "node_modules/http_ece/ece.js"(exports, module) {
    "use strict";
    var crypto2 = __require("crypto");
    var base64 = require_urlsafe_base642();
    var AES_GCM = "aes-128-gcm";
    var PAD_SIZE = { "aes128gcm": 1, "aesgcm": 2, "aesgcm128": 1 };
    var TAG_LENGTH = 16;
    var KEY_LENGTH = 16;
    var NONCE_LENGTH = 12;
    var SHA_256_LENGTH = 32;
    var MODE_ENCRYPT = "encrypt";
    var MODE_DECRYPT = "decrypt";
    var keylog;
    if (process.env.ECE_KEYLOG === "1") {
      keylog = function(m, k) {
        console.warn(m + " [" + k.length + "]: " + base64.encode(k));
        return k;
      };
    } else {
      keylog = function(m, k) {
        return k;
      };
    }
    function decode(b) {
      if (typeof b === "string") {
        return base64.decode(b);
      }
      return b;
    }
    function HMAC_hash(key, input) {
      var hmac = crypto2.createHmac("sha256", key);
      hmac.update(input);
      return hmac.digest();
    }
    function HKDF_extract(salt, ikm) {
      keylog("salt", salt);
      keylog("ikm", ikm);
      return keylog("extract", HMAC_hash(salt, ikm));
    }
    function HKDF_expand(prk, info2, l) {
      keylog("prk", prk);
      keylog("info", info2);
      var output2 = new Buffer(0);
      var T = new Buffer(0);
      info2 = new Buffer(info2, "ascii");
      var counter = 0;
      var cbuf = new Buffer(1);
      while (output2.length < l) {
        cbuf.writeUIntBE(++counter, 0, 1);
        T = HMAC_hash(prk, Buffer.concat([T, info2, cbuf]));
        output2 = Buffer.concat([output2, T]);
      }
      return keylog("expand", output2.slice(0, l));
    }
    function HKDF(salt, ikm, info2, len) {
      return HKDF_expand(HKDF_extract(salt, ikm), info2, len);
    }
    function info(base, context) {
      var result = Buffer.concat([
        new Buffer("Content-Encoding: " + base + "\0", "ascii"),
        context
      ]);
      keylog("info " + base, result);
      return result;
    }
    function lengthPrefix(buffer) {
      var b = Buffer.concat([new Buffer(2), buffer]);
      b.writeUIntBE(buffer.length, 0, 2);
      return b;
    }
    function extractDH(header, mode) {
      var key = header.privateKey;
      var senderPubKey, receiverPubKey;
      if (mode === MODE_ENCRYPT) {
        senderPubKey = key.getPublicKey();
        receiverPubKey = header.dh;
      } else if (mode === MODE_DECRYPT) {
        senderPubKey = header.dh;
        receiverPubKey = key.getPublicKey();
      } else {
        throw new Error("Unknown mode only " + MODE_ENCRYPT + " and " + MODE_DECRYPT + " supported");
      }
      return {
        secret: key.computeSecret(header.dh),
        context: Buffer.concat([
          Buffer.from(header.keylabel, "ascii"),
          Buffer.from([0]),
          lengthPrefix(receiverPubKey),
          // user agent
          lengthPrefix(senderPubKey)
          // application server
        ])
      };
    }
    function extractSecretAndContext(header, mode) {
      var result = { secret: null, context: new Buffer(0) };
      if (header.key) {
        result.secret = header.key;
        if (result.secret.length !== KEY_LENGTH) {
          throw new Error("An explicit key must be " + KEY_LENGTH + " bytes");
        }
      } else if (header.dh) {
        result = extractDH(header, mode);
      } else if (typeof header.keyid !== void 0) {
        result.secret = header.keymap[header.keyid];
      }
      if (!result.secret) {
        throw new Error("Unable to determine key");
      }
      keylog("secret", result.secret);
      keylog("context", result.context);
      if (header.authSecret) {
        result.secret = HKDF(
          header.authSecret,
          result.secret,
          info("auth", new Buffer(0)),
          SHA_256_LENGTH
        );
        keylog("authsecret", result.secret);
      }
      return result;
    }
    function webpushSecret(header, mode) {
      if (!header.authSecret) {
        throw new Error("No authentication secret for webpush");
      }
      keylog("authsecret", header.authSecret);
      var remotePubKey, senderPubKey, receiverPubKey;
      if (mode === MODE_ENCRYPT) {
        senderPubKey = header.privateKey.getPublicKey();
        remotePubKey = receiverPubKey = header.dh;
      } else if (mode === MODE_DECRYPT) {
        remotePubKey = senderPubKey = header.keyid;
        receiverPubKey = header.privateKey.getPublicKey();
      } else {
        throw new Error("Unknown mode only " + MODE_ENCRYPT + " and " + MODE_DECRYPT + " supported");
      }
      keylog("remote pubkey", remotePubKey);
      keylog("sender pubkey", senderPubKey);
      keylog("receiver pubkey", receiverPubKey);
      return keylog(
        "secret dh",
        HKDF(
          header.authSecret,
          header.privateKey.computeSecret(remotePubKey),
          Buffer.concat([
            Buffer.from("WebPush: info\0"),
            receiverPubKey,
            senderPubKey
          ]),
          SHA_256_LENGTH
        )
      );
    }
    function extractSecret(header, mode) {
      if (header.key) {
        if (header.key.length !== KEY_LENGTH) {
          throw new Error("An explicit key must be " + KEY_LENGTH + " bytes");
        }
        return keylog("secret key", header.key);
      }
      if (!header.privateKey) {
        var key = header.keymap && header.keymap[header.keyid];
        if (!key) {
          throw new Error('No saved key (keyid: "' + header.keyid + '")');
        }
        return key;
      }
      return webpushSecret(header, mode);
    }
    function deriveKeyAndNonce(header, mode) {
      if (!header.salt) {
        throw new Error("must include a salt parameter for " + header.version);
      }
      var keyInfo;
      var nonceInfo;
      var secret;
      if (header.version === "aesgcm128") {
        keyInfo = "Content-Encoding: aesgcm128";
        nonceInfo = "Content-Encoding: nonce";
        secret = extractSecretAndContext(header, mode).secret;
      } else if (header.version === "aesgcm") {
        var s = extractSecretAndContext(header, mode);
        keyInfo = info("aesgcm", s.context);
        nonceInfo = info("nonce", s.context);
        secret = s.secret;
      } else if (header.version === "aes128gcm") {
        keyInfo = Buffer.from("Content-Encoding: aes128gcm\0");
        nonceInfo = Buffer.from("Content-Encoding: nonce\0");
        secret = extractSecret(header, mode);
      } else {
        throw new Error("Unable to set context for mode " + params.version);
      }
      var prk = HKDF_extract(header.salt, secret);
      var result = {
        key: HKDF_expand(prk, keyInfo, KEY_LENGTH),
        nonce: HKDF_expand(prk, nonceInfo, NONCE_LENGTH)
      };
      keylog("key", result.key);
      keylog("nonce base", result.nonce);
      return result;
    }
    function parseParams(params2) {
      var header = {};
      header.version = params2.version || "aes128gcm";
      header.rs = parseInt(params2.rs, 10);
      if (isNaN(header.rs)) {
        header.rs = 4096;
      }
      var overhead = PAD_SIZE[header.version];
      if (header.version === "aes128gcm") {
        overhead += TAG_LENGTH;
      }
      if (header.rs <= overhead) {
        throw new Error("The rs parameter has to be greater than " + overhead);
      }
      if (params2.salt) {
        header.salt = decode(params2.salt);
        if (header.salt.length !== KEY_LENGTH) {
          throw new Error("The salt parameter must be " + KEY_LENGTH + " bytes");
        }
      }
      header.keyid = params2.keyid;
      if (params2.key) {
        header.key = decode(params2.key);
      } else {
        header.privateKey = params2.privateKey;
        if (!header.privateKey) {
          header.keymap = params2.keymap;
        }
        if (header.version !== "aes128gcm") {
          header.keylabel = params2.keylabel || "P-256";
        }
        if (params2.dh) {
          header.dh = decode(params2.dh);
        }
      }
      if (params2.authSecret) {
        header.authSecret = decode(params2.authSecret);
      }
      return header;
    }
    function generateNonce(base, counter) {
      var nonce = new Buffer(base);
      var m = nonce.readUIntBE(nonce.length - 6, 6);
      var x = ((m ^ counter) & 16777215) + ((m / 16777216 ^ counter / 16777216) & 16777215) * 16777216;
      nonce.writeUIntBE(x, nonce.length - 6, 6);
      keylog("nonce" + counter, nonce);
      return nonce;
    }
    function readHeader(buffer, header) {
      var idsz = buffer.readUIntBE(20, 1);
      header.salt = buffer.slice(0, KEY_LENGTH);
      header.rs = buffer.readUIntBE(KEY_LENGTH, 4);
      header.keyid = buffer.slice(21, 21 + idsz);
      return 21 + idsz;
    }
    function unpadLegacy(data, version) {
      var padSize = PAD_SIZE[version];
      var pad = data.readUIntBE(0, padSize);
      if (pad + padSize > data.length) {
        throw new Error("padding exceeds block size");
      }
      keylog("padding", data.slice(0, padSize + pad));
      var padCheck = new Buffer(pad);
      padCheck.fill(0);
      if (padCheck.compare(data.slice(padSize, padSize + pad)) !== 0) {
        throw new Error("invalid padding");
      }
      return data.slice(padSize + pad);
    }
    function unpad(data, last) {
      var i = data.length - 1;
      while (i >= 0) {
        if (data[i]) {
          if (last) {
            if (data[i] !== 2) {
              throw new Error("last record needs to start padding with a 2");
            }
          } else {
            if (data[i] !== 1) {
              throw new Error("last record needs to start padding with a 2");
            }
          }
          return data.slice(0, i);
        }
        --i;
      }
      throw new Error("all zero plaintext");
    }
    function decryptRecord(key, counter, buffer, header, last) {
      keylog("decrypt", buffer);
      var nonce = generateNonce(key.nonce, counter);
      var gcm = crypto2.createDecipheriv(AES_GCM, key.key, nonce);
      gcm.setAuthTag(buffer.slice(buffer.length - TAG_LENGTH));
      var data = gcm.update(buffer.slice(0, buffer.length - TAG_LENGTH));
      data = Buffer.concat([data, gcm.final()]);
      keylog("decrypted", data);
      if (header.version !== "aes128gcm") {
        return unpadLegacy(data, header.version);
      }
      return unpad(data, last);
    }
    function decrypt(buffer, params2) {
      var header = parseParams(params2);
      if (header.version === "aes128gcm") {
        var headerLength = readHeader(buffer, header);
        buffer = buffer.slice(headerLength);
      }
      var key = deriveKeyAndNonce(header, MODE_DECRYPT);
      var start = 0;
      var result = new Buffer(0);
      var chunkSize = header.rs;
      if (header.version !== "aes128gcm") {
        chunkSize += TAG_LENGTH;
      }
      for (var i = 0; start < buffer.length; ++i) {
        var end = start + chunkSize;
        if (header.version !== "aes128gcm" && end === buffer.length) {
          throw new Error("Truncated payload");
        }
        end = Math.min(end, buffer.length);
        if (end - start <= TAG_LENGTH) {
          throw new Error("Invalid block: too small at " + i);
        }
        var block = decryptRecord(
          key,
          i,
          buffer.slice(start, end),
          header,
          end >= buffer.length
        );
        result = Buffer.concat([result, block]);
        start = end;
      }
      return result;
    }
    function encryptRecord(key, counter, buffer, pad, header, last) {
      keylog("encrypt", buffer);
      pad = pad || 0;
      var nonce = generateNonce(key.nonce, counter);
      var gcm = crypto2.createCipheriv(AES_GCM, key.key, nonce);
      var ciphertext = [];
      var padSize = PAD_SIZE[header.version];
      var padding = new Buffer(pad + padSize);
      padding.fill(0);
      if (header.version !== "aes128gcm") {
        padding.writeUIntBE(pad, 0, padSize);
        keylog("padding", padding);
        ciphertext.push(gcm.update(padding));
        ciphertext.push(gcm.update(buffer));
        if (!last && padding.length + buffer.length < header.rs) {
          throw new Error("Unable to pad to record size");
        }
      } else {
        ciphertext.push(gcm.update(buffer));
        padding.writeUIntBE(last ? 2 : 1, 0, 1);
        keylog("padding", padding);
        ciphertext.push(gcm.update(padding));
      }
      gcm.final();
      var tag = gcm.getAuthTag();
      if (tag.length !== TAG_LENGTH) {
        throw new Error("invalid tag generated");
      }
      ciphertext.push(tag);
      return keylog("encrypted", Buffer.concat(ciphertext));
    }
    function writeHeader(header) {
      var ints = new Buffer(5);
      var keyid = Buffer.from(header.keyid || []);
      if (keyid.length > 255) {
        throw new Error("keyid is too large");
      }
      ints.writeUIntBE(header.rs, 0, 4);
      ints.writeUIntBE(keyid.length, 4, 1);
      return Buffer.concat([header.salt, ints, keyid]);
    }
    function encrypt(buffer, params2) {
      if (!Buffer.isBuffer(buffer)) {
        throw new Error("buffer argument must be a Buffer");
      }
      var header = parseParams(params2);
      if (!header.salt) {
        header.salt = crypto2.randomBytes(KEY_LENGTH);
      }
      var result;
      if (header.version === "aes128gcm") {
        if (header.privateKey && !header.keyid) {
          header.keyid = header.privateKey.getPublicKey();
        }
        result = writeHeader(header);
      } else {
        result = new Buffer(0);
      }
      var key = deriveKeyAndNonce(header, MODE_ENCRYPT);
      var start = 0;
      var padSize = PAD_SIZE[header.version];
      var overhead = padSize;
      if (header.version === "aes128gcm") {
        overhead += TAG_LENGTH;
      }
      var pad = isNaN(parseInt(params2.pad, 10)) ? 0 : parseInt(params2.pad, 10);
      var counter = 0;
      var last = false;
      while (!last) {
        var recordPad = Math.min(header.rs - overhead - 1, pad);
        if (header.version !== "aes128gcm") {
          recordPad = Math.min((1 << padSize * 8) - 1, recordPad);
        }
        if (pad > 0 && recordPad === 0) {
          ++recordPad;
        }
        pad -= recordPad;
        var end = start + header.rs - overhead - recordPad;
        if (header.version !== "aes128gcm") {
          last = end > buffer.length;
        } else {
          last = end >= buffer.length;
        }
        last = last && pad <= 0;
        var block = encryptRecord(
          key,
          counter,
          buffer.slice(start, end),
          recordPad,
          header,
          last
        );
        result = Buffer.concat([result, block]);
        start = end;
        ++counter;
      }
      return result;
    }
    module.exports = {
      decrypt,
      encrypt
    };
  }
});

// node_modules/web-push/src/encryption-helper.js
var require_encryption_helper = __commonJS({
  "node_modules/web-push/src/encryption-helper.js"(exports, module) {
    "use strict";
    var crypto2 = __require("crypto");
    var ece = require_ece();
    var encrypt = function(userPublicKey, userAuth, payload, contentEncoding) {
      if (!userPublicKey) {
        throw new Error("No user public key provided for encryption.");
      }
      if (typeof userPublicKey !== "string") {
        throw new Error("The subscription p256dh value must be a string.");
      }
      if (Buffer.from(userPublicKey, "base64url").length !== 65) {
        throw new Error("The subscription p256dh value should be 65 bytes long.");
      }
      if (!userAuth) {
        throw new Error("No user auth provided for encryption.");
      }
      if (typeof userAuth !== "string") {
        throw new Error("The subscription auth key must be a string.");
      }
      if (Buffer.from(userAuth, "base64url").length < 16) {
        throw new Error("The subscription auth key should be at least 16 bytes long");
      }
      if (typeof payload !== "string" && !Buffer.isBuffer(payload)) {
        throw new Error("Payload must be either a string or a Node Buffer.");
      }
      if (typeof payload === "string" || payload instanceof String) {
        payload = Buffer.from(payload);
      }
      const localCurve = crypto2.createECDH("prime256v1");
      const localPublicKey = localCurve.generateKeys();
      const salt = crypto2.randomBytes(16).toString("base64url");
      const cipherText = ece.encrypt(payload, {
        version: contentEncoding,
        dh: userPublicKey,
        privateKey: localCurve,
        salt,
        authSecret: userAuth
      });
      return {
        localPublicKey,
        salt,
        cipherText
      };
    };
    module.exports = {
      encrypt
    };
  }
});

// node_modules/web-push/src/web-push-error.js
var require_web_push_error = __commonJS({
  "node_modules/web-push/src/web-push-error.js"(exports, module) {
    "use strict";
    function WebPushError(message, statusCode, headers2, body, endpoint) {
      Error.captureStackTrace(this, this.constructor);
      this.name = this.constructor.name;
      this.message = message;
      this.statusCode = statusCode;
      this.headers = headers2;
      this.body = body;
      this.endpoint = endpoint;
    }
    __require("util").inherits(WebPushError, Error);
    module.exports = WebPushError;
  }
});

// node_modules/ms/index.js
var require_ms = __commonJS({
  "node_modules/ms/index.js"(exports, module) {
    var s = 1e3;
    var m = s * 60;
    var h = m * 60;
    var d = h * 24;
    var w = d * 7;
    var y = d * 365.25;
    module.exports = function(val, options) {
      options = options || {};
      var type = typeof val;
      if (type === "string" && val.length > 0) {
        return parse(val);
      } else if (type === "number" && isFinite(val)) {
        return options.long ? fmtLong(val) : fmtShort(val);
      }
      throw new Error(
        "val is not a non-empty string or a valid number. val=" + JSON.stringify(val)
      );
    };
    function parse(str) {
      str = String(str);
      if (str.length > 100) {
        return;
      }
      var match = /^(-?(?:\d+)?\.?\d+) *(milliseconds?|msecs?|ms|seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|weeks?|w|years?|yrs?|y)?$/i.exec(
        str
      );
      if (!match) {
        return;
      }
      var n = parseFloat(match[1]);
      var type = (match[2] || "ms").toLowerCase();
      switch (type) {
        case "years":
        case "year":
        case "yrs":
        case "yr":
        case "y":
          return n * y;
        case "weeks":
        case "week":
        case "w":
          return n * w;
        case "days":
        case "day":
        case "d":
          return n * d;
        case "hours":
        case "hour":
        case "hrs":
        case "hr":
        case "h":
          return n * h;
        case "minutes":
        case "minute":
        case "mins":
        case "min":
        case "m":
          return n * m;
        case "seconds":
        case "second":
        case "secs":
        case "sec":
        case "s":
          return n * s;
        case "milliseconds":
        case "millisecond":
        case "msecs":
        case "msec":
        case "ms":
          return n;
        default:
          return void 0;
      }
    }
    function fmtShort(ms) {
      var msAbs = Math.abs(ms);
      if (msAbs >= d) {
        return Math.round(ms / d) + "d";
      }
      if (msAbs >= h) {
        return Math.round(ms / h) + "h";
      }
      if (msAbs >= m) {
        return Math.round(ms / m) + "m";
      }
      if (msAbs >= s) {
        return Math.round(ms / s) + "s";
      }
      return ms + "ms";
    }
    function fmtLong(ms) {
      var msAbs = Math.abs(ms);
      if (msAbs >= d) {
        return plural(ms, msAbs, d, "day");
      }
      if (msAbs >= h) {
        return plural(ms, msAbs, h, "hour");
      }
      if (msAbs >= m) {
        return plural(ms, msAbs, m, "minute");
      }
      if (msAbs >= s) {
        return plural(ms, msAbs, s, "second");
      }
      return ms + " ms";
    }
    function plural(ms, msAbs, n, name) {
      var isPlural = msAbs >= n * 1.5;
      return Math.round(ms / n) + " " + name + (isPlural ? "s" : "");
    }
  }
});

// node_modules/debug/src/common.js
var require_common = __commonJS({
  "node_modules/debug/src/common.js"(exports, module) {
    function setup(env) {
      createDebug.debug = createDebug;
      createDebug.default = createDebug;
      createDebug.coerce = coerce;
      createDebug.disable = disable;
      createDebug.enable = enable;
      createDebug.enabled = enabled;
      createDebug.humanize = require_ms();
      createDebug.destroy = destroy;
      Object.keys(env).forEach((key) => {
        createDebug[key] = env[key];
      });
      createDebug.names = [];
      createDebug.skips = [];
      createDebug.formatters = {};
      function selectColor(namespace) {
        let hash = 0;
        for (let i = 0; i < namespace.length; i++) {
          hash = (hash << 5) - hash + namespace.charCodeAt(i);
          hash |= 0;
        }
        return createDebug.colors[Math.abs(hash) % createDebug.colors.length];
      }
      createDebug.selectColor = selectColor;
      function createDebug(namespace) {
        let prevTime;
        let enableOverride = null;
        let namespacesCache;
        let enabledCache;
        function debug(...args) {
          if (!debug.enabled) {
            return;
          }
          const self = debug;
          const curr = Number(/* @__PURE__ */ new Date());
          const ms = curr - (prevTime || curr);
          self.diff = ms;
          self.prev = prevTime;
          self.curr = curr;
          prevTime = curr;
          args[0] = createDebug.coerce(args[0]);
          if (typeof args[0] !== "string") {
            args.unshift("%O");
          }
          let index = 0;
          args[0] = args[0].replace(/%([a-zA-Z%])/g, (match, format) => {
            if (match === "%%") {
              return "%";
            }
            index++;
            const formatter = createDebug.formatters[format];
            if (typeof formatter === "function") {
              const val = args[index];
              match = formatter.call(self, val);
              args.splice(index, 1);
              index--;
            }
            return match;
          });
          createDebug.formatArgs.call(self, args);
          const logFn = self.log || createDebug.log;
          logFn.apply(self, args);
        }
        debug.namespace = namespace;
        debug.useColors = createDebug.useColors();
        debug.color = createDebug.selectColor(namespace);
        debug.extend = extend;
        debug.destroy = createDebug.destroy;
        Object.defineProperty(debug, "enabled", {
          enumerable: true,
          configurable: false,
          get: () => {
            if (enableOverride !== null) {
              return enableOverride;
            }
            if (namespacesCache !== createDebug.namespaces) {
              namespacesCache = createDebug.namespaces;
              enabledCache = createDebug.enabled(namespace);
            }
            return enabledCache;
          },
          set: (v) => {
            enableOverride = v;
          }
        });
        if (typeof createDebug.init === "function") {
          createDebug.init(debug);
        }
        return debug;
      }
      function extend(namespace, delimiter) {
        const newDebug = createDebug(this.namespace + (typeof delimiter === "undefined" ? ":" : delimiter) + namespace);
        newDebug.log = this.log;
        return newDebug;
      }
      function enable(namespaces) {
        createDebug.save(namespaces);
        createDebug.namespaces = namespaces;
        createDebug.names = [];
        createDebug.skips = [];
        let i;
        const split = (typeof namespaces === "string" ? namespaces : "").split(/[\s,]+/);
        const len = split.length;
        for (i = 0; i < len; i++) {
          if (!split[i]) {
            continue;
          }
          namespaces = split[i].replace(/\*/g, ".*?");
          if (namespaces[0] === "-") {
            createDebug.skips.push(new RegExp("^" + namespaces.slice(1) + "$"));
          } else {
            createDebug.names.push(new RegExp("^" + namespaces + "$"));
          }
        }
      }
      function disable() {
        const namespaces = [
          ...createDebug.names.map(toNamespace),
          ...createDebug.skips.map(toNamespace).map((namespace) => "-" + namespace)
        ].join(",");
        createDebug.enable("");
        return namespaces;
      }
      function enabled(name) {
        if (name[name.length - 1] === "*") {
          return true;
        }
        let i;
        let len;
        for (i = 0, len = createDebug.skips.length; i < len; i++) {
          if (createDebug.skips[i].test(name)) {
            return false;
          }
        }
        for (i = 0, len = createDebug.names.length; i < len; i++) {
          if (createDebug.names[i].test(name)) {
            return true;
          }
        }
        return false;
      }
      function toNamespace(regexp) {
        return regexp.toString().substring(2, regexp.toString().length - 2).replace(/\.\*\?$/, "*");
      }
      function coerce(val) {
        if (val instanceof Error) {
          return val.stack || val.message;
        }
        return val;
      }
      function destroy() {
        console.warn("Instance method `debug.destroy()` is deprecated and no longer does anything. It will be removed in the next major version of `debug`.");
      }
      createDebug.enable(createDebug.load());
      return createDebug;
    }
    module.exports = setup;
  }
});

// node_modules/debug/src/browser.js
var require_browser = __commonJS({
  "node_modules/debug/src/browser.js"(exports, module) {
    exports.formatArgs = formatArgs;
    exports.save = save;
    exports.load = load;
    exports.useColors = useColors;
    exports.storage = localstorage();
    exports.destroy = (() => {
      let warned = false;
      return () => {
        if (!warned) {
          warned = true;
          console.warn("Instance method `debug.destroy()` is deprecated and no longer does anything. It will be removed in the next major version of `debug`.");
        }
      };
    })();
    exports.colors = [
      "#0000CC",
      "#0000FF",
      "#0033CC",
      "#0033FF",
      "#0066CC",
      "#0066FF",
      "#0099CC",
      "#0099FF",
      "#00CC00",
      "#00CC33",
      "#00CC66",
      "#00CC99",
      "#00CCCC",
      "#00CCFF",
      "#3300CC",
      "#3300FF",
      "#3333CC",
      "#3333FF",
      "#3366CC",
      "#3366FF",
      "#3399CC",
      "#3399FF",
      "#33CC00",
      "#33CC33",
      "#33CC66",
      "#33CC99",
      "#33CCCC",
      "#33CCFF",
      "#6600CC",
      "#6600FF",
      "#6633CC",
      "#6633FF",
      "#66CC00",
      "#66CC33",
      "#9900CC",
      "#9900FF",
      "#9933CC",
      "#9933FF",
      "#99CC00",
      "#99CC33",
      "#CC0000",
      "#CC0033",
      "#CC0066",
      "#CC0099",
      "#CC00CC",
      "#CC00FF",
      "#CC3300",
      "#CC3333",
      "#CC3366",
      "#CC3399",
      "#CC33CC",
      "#CC33FF",
      "#CC6600",
      "#CC6633",
      "#CC9900",
      "#CC9933",
      "#CCCC00",
      "#CCCC33",
      "#FF0000",
      "#FF0033",
      "#FF0066",
      "#FF0099",
      "#FF00CC",
      "#FF00FF",
      "#FF3300",
      "#FF3333",
      "#FF3366",
      "#FF3399",
      "#FF33CC",
      "#FF33FF",
      "#FF6600",
      "#FF6633",
      "#FF9900",
      "#FF9933",
      "#FFCC00",
      "#FFCC33"
    ];
    function useColors() {
      if (typeof window !== "undefined" && window.process && (window.process.type === "renderer" || window.process.__nwjs)) {
        return true;
      }
      if (typeof navigator !== "undefined" && navigator.userAgent && navigator.userAgent.toLowerCase().match(/(edge|trident)\/(\d+)/)) {
        return false;
      }
      return typeof document !== "undefined" && document.documentElement && document.documentElement.style && document.documentElement.style.WebkitAppearance || // Is firebug? http://stackoverflow.com/a/398120/376773
      typeof window !== "undefined" && window.console && (window.console.firebug || window.console.exception && window.console.table) || // Is firefox >= v31?
      // https://developer.mozilla.org/en-US/docs/Tools/Web_Console#Styling_messages
      typeof navigator !== "undefined" && navigator.userAgent && navigator.userAgent.toLowerCase().match(/firefox\/(\d+)/) && parseInt(RegExp.$1, 10) >= 31 || // Double check webkit in userAgent just in case we are in a worker
      typeof navigator !== "undefined" && navigator.userAgent && navigator.userAgent.toLowerCase().match(/applewebkit\/(\d+)/);
    }
    function formatArgs(args) {
      args[0] = (this.useColors ? "%c" : "") + this.namespace + (this.useColors ? " %c" : " ") + args[0] + (this.useColors ? "%c " : " ") + "+" + module.exports.humanize(this.diff);
      if (!this.useColors) {
        return;
      }
      const c = "color: " + this.color;
      args.splice(1, 0, c, "color: inherit");
      let index = 0;
      let lastC = 0;
      args[0].replace(/%[a-zA-Z%]/g, (match) => {
        if (match === "%%") {
          return;
        }
        index++;
        if (match === "%c") {
          lastC = index;
        }
      });
      args.splice(lastC, 0, c);
    }
    exports.log = console.debug || console.log || (() => {
    });
    function save(namespaces) {
      try {
        if (namespaces) {
          exports.storage.setItem("debug", namespaces);
        } else {
          exports.storage.removeItem("debug");
        }
      } catch (error2) {
      }
    }
    function load() {
      let r;
      try {
        r = exports.storage.getItem("debug");
      } catch (error2) {
      }
      if (!r && typeof process !== "undefined" && "env" in process) {
        r = process.env.DEBUG;
      }
      return r;
    }
    function localstorage() {
      try {
        return localStorage;
      } catch (error2) {
      }
    }
    module.exports = require_common()(exports);
    var { formatters } = module.exports;
    formatters.j = function(v) {
      try {
        return JSON.stringify(v);
      } catch (error2) {
        return "[UnexpectedJSONParseError]: " + error2.message;
      }
    };
  }
});

// node_modules/has-flag/index.js
var require_has_flag = __commonJS({
  "node_modules/has-flag/index.js"(exports, module) {
    "use strict";
    module.exports = (flag, argv = process.argv) => {
      const prefix = flag.startsWith("-") ? "" : flag.length === 1 ? "-" : "--";
      const position = argv.indexOf(prefix + flag);
      const terminatorPosition = argv.indexOf("--");
      return position !== -1 && (terminatorPosition === -1 || position < terminatorPosition);
    };
  }
});

// node_modules/supports-color/index.js
var require_supports_color = __commonJS({
  "node_modules/supports-color/index.js"(exports, module) {
    "use strict";
    var os = __require("os");
    var tty = __require("tty");
    var hasFlag = require_has_flag();
    var { env } = process;
    var forceColor;
    if (hasFlag("no-color") || hasFlag("no-colors") || hasFlag("color=false") || hasFlag("color=never")) {
      forceColor = 0;
    } else if (hasFlag("color") || hasFlag("colors") || hasFlag("color=true") || hasFlag("color=always")) {
      forceColor = 1;
    }
    if ("FORCE_COLOR" in env) {
      if (env.FORCE_COLOR === "true") {
        forceColor = 1;
      } else if (env.FORCE_COLOR === "false") {
        forceColor = 0;
      } else {
        forceColor = env.FORCE_COLOR.length === 0 ? 1 : Math.min(parseInt(env.FORCE_COLOR, 10), 3);
      }
    }
    function translateLevel(level) {
      if (level === 0) {
        return false;
      }
      return {
        level,
        hasBasic: true,
        has256: level >= 2,
        has16m: level >= 3
      };
    }
    function supportsColor(haveStream, streamIsTTY) {
      if (forceColor === 0) {
        return 0;
      }
      if (hasFlag("color=16m") || hasFlag("color=full") || hasFlag("color=truecolor")) {
        return 3;
      }
      if (hasFlag("color=256")) {
        return 2;
      }
      if (haveStream && !streamIsTTY && forceColor === void 0) {
        return 0;
      }
      const min = forceColor || 0;
      if (env.TERM === "dumb") {
        return min;
      }
      if (process.platform === "win32") {
        const osRelease = os.release().split(".");
        if (Number(osRelease[0]) >= 10 && Number(osRelease[2]) >= 10586) {
          return Number(osRelease[2]) >= 14931 ? 3 : 2;
        }
        return 1;
      }
      if ("CI" in env) {
        if (["TRAVIS", "CIRCLECI", "APPVEYOR", "GITLAB_CI", "GITHUB_ACTIONS", "BUILDKITE"].some((sign) => sign in env) || env.CI_NAME === "codeship") {
          return 1;
        }
        return min;
      }
      if ("TEAMCITY_VERSION" in env) {
        return /^(9\.(0*[1-9]\d*)\.|\d{2,}\.)/.test(env.TEAMCITY_VERSION) ? 1 : 0;
      }
      if (env.COLORTERM === "truecolor") {
        return 3;
      }
      if ("TERM_PROGRAM" in env) {
        const version = parseInt((env.TERM_PROGRAM_VERSION || "").split(".")[0], 10);
        switch (env.TERM_PROGRAM) {
          case "iTerm.app":
            return version >= 3 ? 3 : 2;
          case "Apple_Terminal":
            return 2;
        }
      }
      if (/-256(color)?$/i.test(env.TERM)) {
        return 2;
      }
      if (/^screen|^xterm|^vt100|^vt220|^rxvt|color|ansi|cygwin|linux/i.test(env.TERM)) {
        return 1;
      }
      if ("COLORTERM" in env) {
        return 1;
      }
      return min;
    }
    function getSupportLevel(stream) {
      const level = supportsColor(stream, stream && stream.isTTY);
      return translateLevel(level);
    }
    module.exports = {
      supportsColor: getSupportLevel,
      stdout: translateLevel(supportsColor(true, tty.isatty(1))),
      stderr: translateLevel(supportsColor(true, tty.isatty(2)))
    };
  }
});

// node_modules/debug/src/node.js
var require_node2 = __commonJS({
  "node_modules/debug/src/node.js"(exports, module) {
    var tty = __require("tty");
    var util = __require("util");
    exports.init = init2;
    exports.log = log2;
    exports.formatArgs = formatArgs;
    exports.save = save;
    exports.load = load;
    exports.useColors = useColors;
    exports.destroy = util.deprecate(
      () => {
      },
      "Instance method `debug.destroy()` is deprecated and no longer does anything. It will be removed in the next major version of `debug`."
    );
    exports.colors = [6, 2, 3, 4, 5, 1];
    try {
      const supportsColor = require_supports_color();
      if (supportsColor && (supportsColor.stderr || supportsColor).level >= 2) {
        exports.colors = [
          20,
          21,
          26,
          27,
          32,
          33,
          38,
          39,
          40,
          41,
          42,
          43,
          44,
          45,
          56,
          57,
          62,
          63,
          68,
          69,
          74,
          75,
          76,
          77,
          78,
          79,
          80,
          81,
          92,
          93,
          98,
          99,
          112,
          113,
          128,
          129,
          134,
          135,
          148,
          149,
          160,
          161,
          162,
          163,
          164,
          165,
          166,
          167,
          168,
          169,
          170,
          171,
          172,
          173,
          178,
          179,
          184,
          185,
          196,
          197,
          198,
          199,
          200,
          201,
          202,
          203,
          204,
          205,
          206,
          207,
          208,
          209,
          214,
          215,
          220,
          221
        ];
      }
    } catch (error2) {
    }
    exports.inspectOpts = Object.keys(process.env).filter((key) => {
      return /^debug_/i.test(key);
    }).reduce((obj, key) => {
      const prop = key.substring(6).toLowerCase().replace(/_([a-z])/g, (_23, k) => {
        return k.toUpperCase();
      });
      let val = process.env[key];
      if (/^(yes|on|true|enabled)$/i.test(val)) {
        val = true;
      } else if (/^(no|off|false|disabled)$/i.test(val)) {
        val = false;
      } else if (val === "null") {
        val = null;
      } else {
        val = Number(val);
      }
      obj[prop] = val;
      return obj;
    }, {});
    function useColors() {
      return "colors" in exports.inspectOpts ? Boolean(exports.inspectOpts.colors) : tty.isatty(process.stderr.fd);
    }
    function formatArgs(args) {
      const { namespace: name, useColors: useColors2 } = this;
      if (useColors2) {
        const c = this.color;
        const colorCode = "\x1B[3" + (c < 8 ? c : "8;5;" + c);
        const prefix = `  ${colorCode};1m${name} \x1B[0m`;
        args[0] = prefix + args[0].split("\n").join("\n" + prefix);
        args.push(colorCode + "m+" + module.exports.humanize(this.diff) + "\x1B[0m");
      } else {
        args[0] = getDate() + name + " " + args[0];
      }
    }
    function getDate() {
      if (exports.inspectOpts.hideDate) {
        return "";
      }
      return (/* @__PURE__ */ new Date()).toISOString() + " ";
    }
    function log2(...args) {
      return process.stderr.write(util.format(...args) + "\n");
    }
    function save(namespaces) {
      if (namespaces) {
        process.env.DEBUG = namespaces;
      } else {
        delete process.env.DEBUG;
      }
    }
    function load() {
      return process.env.DEBUG;
    }
    function init2(debug) {
      debug.inspectOpts = {};
      const keys = Object.keys(exports.inspectOpts);
      for (let i = 0; i < keys.length; i++) {
        debug.inspectOpts[keys[i]] = exports.inspectOpts[keys[i]];
      }
    }
    module.exports = require_common()(exports);
    var { formatters } = module.exports;
    formatters.o = function(v) {
      this.inspectOpts.colors = this.useColors;
      return util.inspect(v, this.inspectOpts).split("\n").map((str) => str.trim()).join(" ");
    };
    formatters.O = function(v) {
      this.inspectOpts.colors = this.useColors;
      return util.inspect(v, this.inspectOpts);
    };
  }
});

// node_modules/debug/src/index.js
var require_src = __commonJS({
  "node_modules/debug/src/index.js"(exports, module) {
    if (typeof process === "undefined" || process.type === "renderer" || process.browser === true || process.__nwjs) {
      module.exports = require_browser();
    } else {
      module.exports = require_node2();
    }
  }
});

// node_modules/agent-base/dist/helpers.js
var require_helpers = __commonJS({
  "node_modules/agent-base/dist/helpers.js"(exports) {
    "use strict";
    var __createBinding = exports && exports.__createBinding || (Object.create ? function(o, m, k, k2) {
      if (k2 === void 0)
        k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m, k);
      if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    } : function(o, m, k, k2) {
      if (k2 === void 0)
        k2 = k;
      o[k2] = m[k];
    });
    var __setModuleDefault = exports && exports.__setModuleDefault || (Object.create ? function(o, v) {
      Object.defineProperty(o, "default", { enumerable: true, value: v });
    } : function(o, v) {
      o["default"] = v;
    });
    var __importStar = exports && exports.__importStar || function(mod) {
      if (mod && mod.__esModule)
        return mod;
      var result = {};
      if (mod != null) {
        for (var k in mod)
          if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k))
            __createBinding(result, mod, k);
      }
      __setModuleDefault(result, mod);
      return result;
    };
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.req = exports.json = exports.toBuffer = void 0;
    var http = __importStar(__require("http"));
    var https = __importStar(__require("https"));
    async function toBuffer(stream) {
      let length = 0;
      const chunks = [];
      for await (const chunk of stream) {
        length += chunk.length;
        chunks.push(chunk);
      }
      return Buffer.concat(chunks, length);
    }
    exports.toBuffer = toBuffer;
    async function json(stream) {
      const buf = await toBuffer(stream);
      const str = buf.toString("utf8");
      try {
        return JSON.parse(str);
      } catch (_err) {
        const err = _err;
        err.message += ` (input: ${str})`;
        throw err;
      }
    }
    exports.json = json;
    function req(url, opts = {}) {
      const href = typeof url === "string" ? url : url.href;
      const req2 = (href.startsWith("https:") ? https : http).request(url, opts);
      const promise = new Promise((resolve, reject) => {
        req2.once("response", resolve).once("error", reject).end();
      });
      req2.then = promise.then.bind(promise);
      return req2;
    }
    exports.req = req;
  }
});

// node_modules/agent-base/dist/index.js
var require_dist = __commonJS({
  "node_modules/agent-base/dist/index.js"(exports) {
    "use strict";
    var __createBinding = exports && exports.__createBinding || (Object.create ? function(o, m, k, k2) {
      if (k2 === void 0)
        k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m, k);
      if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    } : function(o, m, k, k2) {
      if (k2 === void 0)
        k2 = k;
      o[k2] = m[k];
    });
    var __setModuleDefault = exports && exports.__setModuleDefault || (Object.create ? function(o, v) {
      Object.defineProperty(o, "default", { enumerable: true, value: v });
    } : function(o, v) {
      o["default"] = v;
    });
    var __importStar = exports && exports.__importStar || function(mod) {
      if (mod && mod.__esModule)
        return mod;
      var result = {};
      if (mod != null) {
        for (var k in mod)
          if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k))
            __createBinding(result, mod, k);
      }
      __setModuleDefault(result, mod);
      return result;
    };
    var __exportStar = exports && exports.__exportStar || function(m, exports2) {
      for (var p in m)
        if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports2, p))
          __createBinding(exports2, m, p);
    };
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Agent = void 0;
    var http = __importStar(__require("http"));
    __exportStar(require_helpers(), exports);
    var INTERNAL = Symbol("AgentBaseInternalState");
    var Agent = class extends http.Agent {
      constructor(opts) {
        super(opts);
        this[INTERNAL] = {};
      }
      /**
       * Determine whether this is an `http` or `https` request.
       */
      isSecureEndpoint(options) {
        if (options) {
          if (typeof options.secureEndpoint === "boolean") {
            return options.secureEndpoint;
          }
          if (typeof options.protocol === "string") {
            return options.protocol === "https:";
          }
        }
        const { stack } = new Error();
        if (typeof stack !== "string")
          return false;
        return stack.split("\n").some((l) => l.indexOf("(https.js:") !== -1 || l.indexOf("node:https:") !== -1);
      }
      createSocket(req, options, cb) {
        const connectOpts = {
          ...options,
          secureEndpoint: this.isSecureEndpoint(options)
        };
        Promise.resolve().then(() => this.connect(req, connectOpts)).then((socket) => {
          if (socket instanceof http.Agent) {
            return socket.addRequest(req, connectOpts);
          }
          this[INTERNAL].currentSocket = socket;
          super.createSocket(req, options, cb);
        }, cb);
      }
      createConnection() {
        const socket = this[INTERNAL].currentSocket;
        this[INTERNAL].currentSocket = void 0;
        if (!socket) {
          throw new Error("No socket was returned in the `connect()` function");
        }
        return socket;
      }
      get defaultPort() {
        return this[INTERNAL].defaultPort ?? (this.protocol === "https:" ? 443 : 80);
      }
      set defaultPort(v) {
        if (this[INTERNAL]) {
          this[INTERNAL].defaultPort = v;
        }
      }
      get protocol() {
        return this[INTERNAL].protocol ?? (this.isSecureEndpoint() ? "https:" : "http:");
      }
      set protocol(v) {
        if (this[INTERNAL]) {
          this[INTERNAL].protocol = v;
        }
      }
    };
    exports.Agent = Agent;
  }
});

// node_modules/https-proxy-agent/dist/parse-proxy-response.js
var require_parse_proxy_response = __commonJS({
  "node_modules/https-proxy-agent/dist/parse-proxy-response.js"(exports) {
    "use strict";
    var __importDefault = exports && exports.__importDefault || function(mod) {
      return mod && mod.__esModule ? mod : { "default": mod };
    };
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.parseProxyResponse = void 0;
    var debug_1 = __importDefault(require_src());
    var debug = (0, debug_1.default)("https-proxy-agent:parse-proxy-response");
    function parseProxyResponse(socket) {
      return new Promise((resolve, reject) => {
        let buffersLength = 0;
        const buffers = [];
        function read() {
          const b = socket.read();
          if (b)
            ondata(b);
          else
            socket.once("readable", read);
        }
        function cleanup() {
          socket.removeListener("end", onend);
          socket.removeListener("error", onerror);
          socket.removeListener("readable", read);
        }
        function onend() {
          cleanup();
          debug("onend");
          reject(new Error("Proxy connection ended before receiving CONNECT response"));
        }
        function onerror(err) {
          cleanup();
          debug("onerror %o", err);
          reject(err);
        }
        function ondata(b) {
          buffers.push(b);
          buffersLength += b.length;
          const buffered = Buffer.concat(buffers, buffersLength);
          const endOfHeaders = buffered.indexOf("\r\n\r\n");
          if (endOfHeaders === -1) {
            debug("have not received end of HTTP headers yet...");
            read();
            return;
          }
          const headerParts = buffered.slice(0, endOfHeaders).toString("ascii").split("\r\n");
          const firstLine = headerParts.shift();
          if (!firstLine) {
            socket.destroy();
            return reject(new Error("No header received from proxy CONNECT response"));
          }
          const firstLineParts = firstLine.split(" ");
          const statusCode = +firstLineParts[1];
          const statusText = firstLineParts.slice(2).join(" ");
          const headers2 = {};
          for (const header of headerParts) {
            if (!header)
              continue;
            const firstColon = header.indexOf(":");
            if (firstColon === -1) {
              socket.destroy();
              return reject(new Error(`Invalid header from proxy CONNECT response: "${header}"`));
            }
            const key = header.slice(0, firstColon).toLowerCase();
            const value = header.slice(firstColon + 1).trimStart();
            const current = headers2[key];
            if (typeof current === "string") {
              headers2[key] = [current, value];
            } else if (Array.isArray(current)) {
              current.push(value);
            } else {
              headers2[key] = value;
            }
          }
          debug("got proxy server response: %o %o", firstLine, headers2);
          cleanup();
          resolve({
            connect: {
              statusCode,
              statusText,
              headers: headers2
            },
            buffered
          });
        }
        socket.on("error", onerror);
        socket.on("end", onend);
        read();
      });
    }
    exports.parseProxyResponse = parseProxyResponse;
  }
});

// node_modules/https-proxy-agent/dist/index.js
var require_dist2 = __commonJS({
  "node_modules/https-proxy-agent/dist/index.js"(exports) {
    "use strict";
    var __createBinding = exports && exports.__createBinding || (Object.create ? function(o, m, k, k2) {
      if (k2 === void 0)
        k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m, k);
      if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    } : function(o, m, k, k2) {
      if (k2 === void 0)
        k2 = k;
      o[k2] = m[k];
    });
    var __setModuleDefault = exports && exports.__setModuleDefault || (Object.create ? function(o, v) {
      Object.defineProperty(o, "default", { enumerable: true, value: v });
    } : function(o, v) {
      o["default"] = v;
    });
    var __importStar = exports && exports.__importStar || function(mod) {
      if (mod && mod.__esModule)
        return mod;
      var result = {};
      if (mod != null) {
        for (var k in mod)
          if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k))
            __createBinding(result, mod, k);
      }
      __setModuleDefault(result, mod);
      return result;
    };
    var __importDefault = exports && exports.__importDefault || function(mod) {
      return mod && mod.__esModule ? mod : { "default": mod };
    };
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.HttpsProxyAgent = void 0;
    var net = __importStar(__require("net"));
    var tls = __importStar(__require("tls"));
    var assert_1 = __importDefault(__require("assert"));
    var debug_1 = __importDefault(require_src());
    var agent_base_1 = require_dist();
    var parse_proxy_response_1 = require_parse_proxy_response();
    var debug = (0, debug_1.default)("https-proxy-agent");
    var HttpsProxyAgent = class extends agent_base_1.Agent {
      constructor(proxy, opts) {
        super(opts);
        this.options = { path: void 0 };
        this.proxy = typeof proxy === "string" ? new URL(proxy) : proxy;
        this.proxyHeaders = opts?.headers ?? {};
        debug("Creating new HttpsProxyAgent instance: %o", this.proxy.href);
        const host = (this.proxy.hostname || this.proxy.host).replace(/^\[|\]$/g, "");
        const port = this.proxy.port ? parseInt(this.proxy.port, 10) : this.proxy.protocol === "https:" ? 443 : 80;
        this.connectOpts = {
          // Attempt to negotiate http/1.1 for proxy servers that support http/2
          ALPNProtocols: ["http/1.1"],
          ...opts ? omit(opts, "headers") : null,
          host,
          port
        };
      }
      /**
       * Called when the node-core HTTP client library is creating a
       * new HTTP request.
       */
      async connect(req, opts) {
        const { proxy } = this;
        if (!opts.host) {
          throw new TypeError('No "host" provided');
        }
        let socket;
        if (proxy.protocol === "https:") {
          debug("Creating `tls.Socket`: %o", this.connectOpts);
          socket = tls.connect(this.connectOpts);
        } else {
          debug("Creating `net.Socket`: %o", this.connectOpts);
          socket = net.connect(this.connectOpts);
        }
        const headers2 = typeof this.proxyHeaders === "function" ? this.proxyHeaders() : { ...this.proxyHeaders };
        const host = net.isIPv6(opts.host) ? `[${opts.host}]` : opts.host;
        let payload = `CONNECT ${host}:${opts.port} HTTP/1.1\r
`;
        if (proxy.username || proxy.password) {
          const auth = `${decodeURIComponent(proxy.username)}:${decodeURIComponent(proxy.password)}`;
          headers2["Proxy-Authorization"] = `Basic ${Buffer.from(auth).toString("base64")}`;
        }
        headers2.Host = `${host}:${opts.port}`;
        if (!headers2["Proxy-Connection"]) {
          headers2["Proxy-Connection"] = this.keepAlive ? "Keep-Alive" : "close";
        }
        for (const name of Object.keys(headers2)) {
          payload += `${name}: ${headers2[name]}\r
`;
        }
        const proxyResponsePromise = (0, parse_proxy_response_1.parseProxyResponse)(socket);
        socket.write(`${payload}\r
`);
        const { connect, buffered } = await proxyResponsePromise;
        req.emit("proxyConnect", connect);
        this.emit("proxyConnect", connect, req);
        if (connect.statusCode === 200) {
          req.once("socket", resume);
          if (opts.secureEndpoint) {
            debug("Upgrading socket connection to TLS");
            const servername = opts.servername || opts.host;
            return tls.connect({
              ...omit(opts, "host", "path", "port"),
              socket,
              servername: net.isIP(servername) ? void 0 : servername
            });
          }
          return socket;
        }
        socket.destroy();
        const fakeSocket = new net.Socket({ writable: false });
        fakeSocket.readable = true;
        req.once("socket", (s) => {
          debug("Replaying proxy buffer for failed request");
          (0, assert_1.default)(s.listenerCount("data") > 0);
          s.push(buffered);
          s.push(null);
        });
        return fakeSocket;
      }
    };
    HttpsProxyAgent.protocols = ["http", "https"];
    exports.HttpsProxyAgent = HttpsProxyAgent;
    function resume(socket) {
      socket.resume();
    }
    function omit(obj, ...keys) {
      const ret = {};
      let key;
      for (key in obj) {
        if (!keys.includes(key)) {
          ret[key] = obj[key];
        }
      }
      return ret;
    }
  }
});

// node_modules/web-push/src/web-push-lib.js
var require_web_push_lib = __commonJS({
  "node_modules/web-push/src/web-push-lib.js"(exports, module) {
    "use strict";
    var url = __require("url");
    var https = __require("https");
    var WebPushError = require_web_push_error();
    var vapidHelper = require_vapid_helper();
    var encryptionHelper = require_encryption_helper();
    var webPushConstants = require_web_push_constants();
    var urlBase64Helper = require_urlsafe_base64_helper();
    var DEFAULT_TTL = 2419200;
    var gcmAPIKey = "";
    var vapidDetails;
    function WebPushLib() {
    }
    WebPushLib.prototype.setGCMAPIKey = function(apiKey) {
      if (apiKey === null) {
        gcmAPIKey = null;
        return;
      }
      if (typeof apiKey === "undefined" || typeof apiKey !== "string" || apiKey.length === 0) {
        throw new Error("The GCM API Key should be a non-empty string or null.");
      }
      gcmAPIKey = apiKey;
    };
    WebPushLib.prototype.setVapidDetails = function(subject, publicKey, privateKey) {
      if (arguments.length === 1 && arguments[0] === null) {
        vapidDetails = null;
        return;
      }
      vapidHelper.validateSubject(subject);
      vapidHelper.validatePublicKey(publicKey);
      vapidHelper.validatePrivateKey(privateKey);
      vapidDetails = {
        subject,
        publicKey,
        privateKey
      };
    };
    WebPushLib.prototype.generateRequestDetails = function(subscription, payload, options) {
      if (!subscription || !subscription.endpoint) {
        throw new Error("You must pass in a subscription with at least an endpoint.");
      }
      if (typeof subscription.endpoint !== "string" || subscription.endpoint.length === 0) {
        throw new Error("The subscription endpoint must be a string with a valid URL.");
      }
      if (payload) {
        if (typeof subscription !== "object" || !subscription.keys || !subscription.keys.p256dh || !subscription.keys.auth) {
          throw new Error("To send a message with a payload, the subscription must have 'auth' and 'p256dh' keys.");
        }
      }
      let currentGCMAPIKey = gcmAPIKey;
      let currentVapidDetails = vapidDetails;
      let timeToLive = DEFAULT_TTL;
      let extraHeaders = {};
      let contentEncoding = webPushConstants.supportedContentEncodings.AES_128_GCM;
      let urgency = webPushConstants.supportedUrgency.NORMAL;
      let topic;
      let proxy;
      let agent;
      let timeout2;
      if (options) {
        const validOptionKeys = [
          "headers",
          "gcmAPIKey",
          "vapidDetails",
          "TTL",
          "contentEncoding",
          "urgency",
          "topic",
          "proxy",
          "agent",
          "timeout"
        ];
        const optionKeys = Object.keys(options);
        for (let i = 0; i < optionKeys.length; i += 1) {
          const optionKey = optionKeys[i];
          if (!validOptionKeys.includes(optionKey)) {
            throw new Error("'" + optionKey + "' is an invalid option. The valid options are ['" + validOptionKeys.join("', '") + "'].");
          }
        }
        if (options.headers) {
          extraHeaders = options.headers;
          let duplicates = Object.keys(extraHeaders).filter(function(header) {
            return typeof options[header] !== "undefined";
          });
          if (duplicates.length > 0) {
            throw new Error("Duplicated headers defined [" + duplicates.join(",") + "]. Please either define the header in thetop level options OR in the 'headers' key.");
          }
        }
        if (options.gcmAPIKey) {
          currentGCMAPIKey = options.gcmAPIKey;
        }
        if (options.vapidDetails !== void 0) {
          currentVapidDetails = options.vapidDetails;
        }
        if (options.TTL !== void 0) {
          timeToLive = Number(options.TTL);
          if (timeToLive < 0) {
            throw new Error("TTL should be a number and should be at least 0");
          }
        }
        if (options.contentEncoding) {
          if (options.contentEncoding === webPushConstants.supportedContentEncodings.AES_128_GCM || options.contentEncoding === webPushConstants.supportedContentEncodings.AES_GCM) {
            contentEncoding = options.contentEncoding;
          } else {
            throw new Error("Unsupported content encoding specified.");
          }
        }
        if (options.urgency) {
          if (options.urgency === webPushConstants.supportedUrgency.VERY_LOW || options.urgency === webPushConstants.supportedUrgency.LOW || options.urgency === webPushConstants.supportedUrgency.NORMAL || options.urgency === webPushConstants.supportedUrgency.HIGH) {
            urgency = options.urgency;
          } else {
            throw new Error("Unsupported urgency specified.");
          }
        }
        if (options.topic) {
          if (!urlBase64Helper.validate(options.topic)) {
            throw new Error("Unsupported characters set use the URL or filename-safe Base64 characters set");
          }
          if (options.topic.length > 32) {
            throw new Error("use maximum of 32 characters from the URL or filename-safe Base64 characters set");
          }
          topic = options.topic;
        }
        if (options.proxy) {
          if (typeof options.proxy === "string" || typeof options.proxy.host === "string") {
            proxy = options.proxy;
          } else {
            console.warn("Attempt to use proxy option, but invalid type it should be a string or proxy options object.");
          }
        }
        if (options.agent) {
          if (options.agent instanceof https.Agent) {
            if (proxy) {
              console.warn("Agent option will be ignored because proxy option is defined.");
            }
            agent = options.agent;
          } else {
            console.warn("Wrong type for the agent option, it should be an instance of https.Agent.");
          }
        }
        if (typeof options.timeout === "number") {
          timeout2 = options.timeout;
        }
      }
      if (typeof timeToLive === "undefined") {
        timeToLive = DEFAULT_TTL;
      }
      const requestDetails = {
        method: "POST",
        headers: {
          TTL: timeToLive
        }
      };
      Object.keys(extraHeaders).forEach(function(header) {
        requestDetails.headers[header] = extraHeaders[header];
      });
      let requestPayload = null;
      if (payload) {
        const encrypted = encryptionHelper.encrypt(subscription.keys.p256dh, subscription.keys.auth, payload, contentEncoding);
        requestDetails.headers["Content-Length"] = encrypted.cipherText.length;
        requestDetails.headers["Content-Type"] = "application/octet-stream";
        if (contentEncoding === webPushConstants.supportedContentEncodings.AES_128_GCM) {
          requestDetails.headers["Content-Encoding"] = webPushConstants.supportedContentEncodings.AES_128_GCM;
        } else if (contentEncoding === webPushConstants.supportedContentEncodings.AES_GCM) {
          requestDetails.headers["Content-Encoding"] = webPushConstants.supportedContentEncodings.AES_GCM;
          requestDetails.headers.Encryption = "salt=" + encrypted.salt;
          requestDetails.headers["Crypto-Key"] = "dh=" + encrypted.localPublicKey.toString("base64url");
        }
        requestPayload = encrypted.cipherText;
      } else {
        requestDetails.headers["Content-Length"] = 0;
      }
      const isGCM = subscription.endpoint.startsWith("https://android.googleapis.com/gcm/send");
      const isFCM = subscription.endpoint.startsWith("https://fcm.googleapis.com/fcm/send");
      if (isGCM) {
        if (!currentGCMAPIKey) {
          console.warn("Attempt to send push notification to GCM endpoint, but no GCM key is defined. Please use setGCMApiKey() or add 'gcmAPIKey' as an option.");
        } else {
          requestDetails.headers.Authorization = "key=" + currentGCMAPIKey;
        }
      } else if (currentVapidDetails) {
        const parsedUrl = url.parse(subscription.endpoint);
        const audience = parsedUrl.protocol + "//" + parsedUrl.host;
        const vapidHeaders = vapidHelper.getVapidHeaders(
          audience,
          currentVapidDetails.subject,
          currentVapidDetails.publicKey,
          currentVapidDetails.privateKey,
          contentEncoding
        );
        requestDetails.headers.Authorization = vapidHeaders.Authorization;
        if (contentEncoding === webPushConstants.supportedContentEncodings.AES_GCM) {
          if (requestDetails.headers["Crypto-Key"]) {
            requestDetails.headers["Crypto-Key"] += ";" + vapidHeaders["Crypto-Key"];
          } else {
            requestDetails.headers["Crypto-Key"] = vapidHeaders["Crypto-Key"];
          }
        }
      } else if (isFCM && currentGCMAPIKey) {
        requestDetails.headers.Authorization = "key=" + currentGCMAPIKey;
      }
      requestDetails.headers.Urgency = urgency;
      if (topic) {
        requestDetails.headers.Topic = topic;
      }
      requestDetails.body = requestPayload;
      requestDetails.endpoint = subscription.endpoint;
      if (proxy) {
        requestDetails.proxy = proxy;
      }
      if (agent) {
        requestDetails.agent = agent;
      }
      if (timeout2) {
        requestDetails.timeout = timeout2;
      }
      return requestDetails;
    };
    WebPushLib.prototype.sendNotification = function(subscription, payload, options) {
      let requestDetails;
      try {
        requestDetails = this.generateRequestDetails(subscription, payload, options);
      } catch (err) {
        return Promise.reject(err);
      }
      return new Promise(function(resolve, reject) {
        const httpsOptions = {};
        const urlParts = url.parse(requestDetails.endpoint);
        httpsOptions.hostname = urlParts.hostname;
        httpsOptions.port = urlParts.port;
        httpsOptions.path = urlParts.path;
        httpsOptions.headers = requestDetails.headers;
        httpsOptions.method = requestDetails.method;
        if (requestDetails.timeout) {
          httpsOptions.timeout = requestDetails.timeout;
        }
        if (requestDetails.agent) {
          httpsOptions.agent = requestDetails.agent;
        }
        if (requestDetails.proxy) {
          const HttpsProxyAgent = require_dist2();
          httpsOptions.agent = new HttpsProxyAgent(requestDetails.proxy);
        }
        const pushRequest = https.request(httpsOptions, function(pushResponse) {
          let responseText = "";
          pushResponse.on("data", function(chunk) {
            responseText += chunk;
          });
          pushResponse.on("end", function() {
            if (pushResponse.statusCode < 200 || pushResponse.statusCode > 299) {
              reject(new WebPushError(
                "Received unexpected response code",
                pushResponse.statusCode,
                pushResponse.headers,
                responseText,
                requestDetails.endpoint
              ));
            } else {
              resolve({
                statusCode: pushResponse.statusCode,
                body: responseText,
                headers: pushResponse.headers
              });
            }
          });
        });
        if (requestDetails.timeout) {
          pushRequest.on("timeout", function() {
            pushRequest.destroy(new Error("Socket timeout"));
          });
        }
        pushRequest.on("error", function(e) {
          reject(e);
        });
        if (requestDetails.body) {
          pushRequest.write(requestDetails.body);
        }
        pushRequest.end();
      });
    };
    module.exports = WebPushLib;
  }
});

// node_modules/web-push/src/index.js
var require_src2 = __commonJS({
  "node_modules/web-push/src/index.js"(exports, module) {
    "use strict";
    var vapidHelper = require_vapid_helper();
    var encryptionHelper = require_encryption_helper();
    var WebPushLib = require_web_push_lib();
    var WebPushError = require_web_push_error();
    var WebPushConstants = require_web_push_constants();
    var webPush = new WebPushLib();
    module.exports = {
      WebPushError,
      supportedContentEncodings: WebPushConstants.supportedContentEncodings,
      encrypt: encryptionHelper.encrypt,
      getVapidHeaders: vapidHelper.getVapidHeaders,
      generateVAPIDKeys: vapidHelper.generateVAPIDKeys,
      setGCMAPIKey: webPush.setGCMAPIKey,
      setVapidDetails: webPush.setVapidDetails,
      generateRequestDetails: webPush.generateRequestDetails,
      sendNotification: webPush.sendNotification
    };
  }
});

// node_modules/@sunknudsen/totp/dist/index.js
var require_dist3 = __commonJS({
  "node_modules/@sunknudsen/totp/dist/index.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.validateToken = exports.generateToken = exports.generateUri = exports.generateSecret = void 0;
    var crypto_1 = __require("crypto");
    var charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    var base32ToHex = (base32) => {
      let bits = "";
      let hex = "";
      for (let index = 0; index < base32.length; index++) {
        const value = charset.indexOf(base32.charAt(index));
        bits += `00000${value.toString(2)}`.slice(-5);
      }
      for (let index = 0; index < bits.length - 3; index += 4) {
        const chunk = bits.substring(index, index + 4);
        hex = hex + parseInt(chunk, 2).toString(16);
      }
      return hex;
    };
    var generateSecret = (length = 24) => {
      return (0, crypto_1.randomBytes)(length).map((value) => charset.charCodeAt(Math.floor(value * charset.length / 256))).toString();
    };
    exports.generateSecret = generateSecret;
    var generateUri = (label, username, secret, issuer) => {
      return `otpauth://totp/${encodeURIComponent(label)}:${encodeURIComponent(username)}?secret=${encodeURIComponent(secret)}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
    };
    exports.generateUri = generateUri;
    var generateToken = (secret, timestamp = Date.now()) => {
      const message = Buffer.from(`0000000000000000${Math.floor(Math.round(timestamp / 1e3) / 30).toString(16)}`.slice(-16), "hex");
      const key = Buffer.from(base32ToHex(secret.toUpperCase()), "hex");
      const hmac = (0, crypto_1.createHmac)("sha1", key);
      hmac.setEncoding("hex");
      hmac.update(message);
      hmac.end();
      const data = hmac.read();
      return (parseInt(data.substr(parseInt(data.slice(-1), 16) * 2, 8), 16) & 2147483647).toString().slice(-6);
    };
    exports.generateToken = generateToken;
    var validateToken2 = (secret, token, threshold = 1, timestamp = Date.now()) => {
      for (let index = 0; index < threshold; index++) {
        if (token === (0, exports.generateToken)(secret, timestamp - index * 30 * 1e3)) {
          return true;
        }
      }
      return false;
    };
    exports.validateToken = validateToken2;
  }
});

// node_modules/@babel/runtime/helpers/esm/typeof.js
function _typeof(o) {
  "@babel/helpers - typeof";
  return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function(o2) {
    return typeof o2;
  } : function(o2) {
    return o2 && "function" == typeof Symbol && o2.constructor === Symbol && o2 !== Symbol.prototype ? "symbol" : typeof o2;
  }, _typeof(o);
}
var init_typeof = __esm({
  "node_modules/@babel/runtime/helpers/esm/typeof.js"() {
  }
});

// node_modules/@babel/runtime/helpers/esm/classCallCheck.js
function _classCallCheck(instance2, Constructor) {
  if (!(instance2 instanceof Constructor)) {
    throw new TypeError("Cannot call a class as a function");
  }
}
var init_classCallCheck = __esm({
  "node_modules/@babel/runtime/helpers/esm/classCallCheck.js"() {
  }
});

// node_modules/@babel/runtime/helpers/esm/toPrimitive.js
function toPrimitive(t2, r) {
  if ("object" != _typeof(t2) || !t2)
    return t2;
  var e = t2[Symbol.toPrimitive];
  if (void 0 !== e) {
    var i = e.call(t2, r || "default");
    if ("object" != _typeof(i))
      return i;
    throw new TypeError("@@toPrimitive must return a primitive value.");
  }
  return ("string" === r ? String : Number)(t2);
}
var init_toPrimitive = __esm({
  "node_modules/@babel/runtime/helpers/esm/toPrimitive.js"() {
    init_typeof();
  }
});

// node_modules/@babel/runtime/helpers/esm/toPropertyKey.js
function toPropertyKey(t2) {
  var i = toPrimitive(t2, "string");
  return "symbol" == _typeof(i) ? i : String(i);
}
var init_toPropertyKey = __esm({
  "node_modules/@babel/runtime/helpers/esm/toPropertyKey.js"() {
    init_typeof();
    init_toPrimitive();
  }
});

// node_modules/@babel/runtime/helpers/esm/createClass.js
function _defineProperties(target, props) {
  for (var i = 0; i < props.length; i++) {
    var descriptor = props[i];
    descriptor.enumerable = descriptor.enumerable || false;
    descriptor.configurable = true;
    if ("value" in descriptor)
      descriptor.writable = true;
    Object.defineProperty(target, toPropertyKey(descriptor.key), descriptor);
  }
}
function _createClass(Constructor, protoProps, staticProps) {
  if (protoProps)
    _defineProperties(Constructor.prototype, protoProps);
  if (staticProps)
    _defineProperties(Constructor, staticProps);
  Object.defineProperty(Constructor, "prototype", {
    writable: false
  });
  return Constructor;
}
var init_createClass = __esm({
  "node_modules/@babel/runtime/helpers/esm/createClass.js"() {
    init_toPropertyKey();
  }
});

// node_modules/@babel/runtime/helpers/esm/assertThisInitialized.js
function _assertThisInitialized(self) {
  if (self === void 0) {
    throw new ReferenceError("this hasn't been initialised - super() hasn't been called");
  }
  return self;
}
var init_assertThisInitialized = __esm({
  "node_modules/@babel/runtime/helpers/esm/assertThisInitialized.js"() {
  }
});

// node_modules/@babel/runtime/helpers/esm/setPrototypeOf.js
function _setPrototypeOf(o, p) {
  _setPrototypeOf = Object.setPrototypeOf ? Object.setPrototypeOf.bind() : function _setPrototypeOf2(o2, p2) {
    o2.__proto__ = p2;
    return o2;
  };
  return _setPrototypeOf(o, p);
}
var init_setPrototypeOf = __esm({
  "node_modules/@babel/runtime/helpers/esm/setPrototypeOf.js"() {
  }
});

// node_modules/@babel/runtime/helpers/esm/inherits.js
function _inherits(subClass, superClass) {
  if (typeof superClass !== "function" && superClass !== null) {
    throw new TypeError("Super expression must either be null or a function");
  }
  subClass.prototype = Object.create(superClass && superClass.prototype, {
    constructor: {
      value: subClass,
      writable: true,
      configurable: true
    }
  });
  Object.defineProperty(subClass, "prototype", {
    writable: false
  });
  if (superClass)
    _setPrototypeOf(subClass, superClass);
}
var init_inherits = __esm({
  "node_modules/@babel/runtime/helpers/esm/inherits.js"() {
    init_setPrototypeOf();
  }
});

// node_modules/@babel/runtime/helpers/esm/possibleConstructorReturn.js
function _possibleConstructorReturn(self, call) {
  if (call && (_typeof(call) === "object" || typeof call === "function")) {
    return call;
  } else if (call !== void 0) {
    throw new TypeError("Derived constructors may only return object or undefined");
  }
  return _assertThisInitialized(self);
}
var init_possibleConstructorReturn = __esm({
  "node_modules/@babel/runtime/helpers/esm/possibleConstructorReturn.js"() {
    init_typeof();
    init_assertThisInitialized();
  }
});

// node_modules/@babel/runtime/helpers/esm/getPrototypeOf.js
function _getPrototypeOf(o) {
  _getPrototypeOf = Object.setPrototypeOf ? Object.getPrototypeOf.bind() : function _getPrototypeOf2(o2) {
    return o2.__proto__ || Object.getPrototypeOf(o2);
  };
  return _getPrototypeOf(o);
}
var init_getPrototypeOf = __esm({
  "node_modules/@babel/runtime/helpers/esm/getPrototypeOf.js"() {
  }
});

// node_modules/@babel/runtime/helpers/esm/defineProperty.js
function _defineProperty(obj, key, value) {
  key = toPropertyKey(key);
  if (key in obj) {
    Object.defineProperty(obj, key, {
      value,
      enumerable: true,
      configurable: true,
      writable: true
    });
  } else {
    obj[key] = value;
  }
  return obj;
}
var init_defineProperty = __esm({
  "node_modules/@babel/runtime/helpers/esm/defineProperty.js"() {
    init_toPropertyKey();
  }
});

// node_modules/@babel/runtime/helpers/esm/arrayWithHoles.js
function _arrayWithHoles(arr) {
  if (Array.isArray(arr))
    return arr;
}
var init_arrayWithHoles = __esm({
  "node_modules/@babel/runtime/helpers/esm/arrayWithHoles.js"() {
  }
});

// node_modules/@babel/runtime/helpers/esm/iterableToArray.js
function _iterableToArray(iter) {
  if (typeof Symbol !== "undefined" && iter[Symbol.iterator] != null || iter["@@iterator"] != null)
    return Array.from(iter);
}
var init_iterableToArray = __esm({
  "node_modules/@babel/runtime/helpers/esm/iterableToArray.js"() {
  }
});

// node_modules/@babel/runtime/helpers/esm/arrayLikeToArray.js
function _arrayLikeToArray(arr, len) {
  if (len == null || len > arr.length)
    len = arr.length;
  for (var i = 0, arr2 = new Array(len); i < len; i++)
    arr2[i] = arr[i];
  return arr2;
}
var init_arrayLikeToArray = __esm({
  "node_modules/@babel/runtime/helpers/esm/arrayLikeToArray.js"() {
  }
});

// node_modules/@babel/runtime/helpers/esm/unsupportedIterableToArray.js
function _unsupportedIterableToArray(o, minLen) {
  if (!o)
    return;
  if (typeof o === "string")
    return _arrayLikeToArray(o, minLen);
  var n = Object.prototype.toString.call(o).slice(8, -1);
  if (n === "Object" && o.constructor)
    n = o.constructor.name;
  if (n === "Map" || n === "Set")
    return Array.from(o);
  if (n === "Arguments" || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(n))
    return _arrayLikeToArray(o, minLen);
}
var init_unsupportedIterableToArray = __esm({
  "node_modules/@babel/runtime/helpers/esm/unsupportedIterableToArray.js"() {
    init_arrayLikeToArray();
  }
});

// node_modules/@babel/runtime/helpers/esm/nonIterableRest.js
function _nonIterableRest() {
  throw new TypeError("Invalid attempt to destructure non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.");
}
var init_nonIterableRest = __esm({
  "node_modules/@babel/runtime/helpers/esm/nonIterableRest.js"() {
  }
});

// node_modules/@babel/runtime/helpers/esm/toArray.js
function _toArray(arr) {
  return _arrayWithHoles(arr) || _iterableToArray(arr) || _unsupportedIterableToArray(arr) || _nonIterableRest();
}
var init_toArray = __esm({
  "node_modules/@babel/runtime/helpers/esm/toArray.js"() {
    init_arrayWithHoles();
    init_iterableToArray();
    init_unsupportedIterableToArray();
    init_nonIterableRest();
  }
});

// node_modules/i18next/dist/esm/i18next.js
function ownKeys$6(object, enumerableOnly) {
  var keys = Object.keys(object);
  if (Object.getOwnPropertySymbols) {
    var symbols = Object.getOwnPropertySymbols(object);
    enumerableOnly && (symbols = symbols.filter(function(sym) {
      return Object.getOwnPropertyDescriptor(object, sym).enumerable;
    })), keys.push.apply(keys, symbols);
  }
  return keys;
}
function _objectSpread$6(target) {
  for (var i = 1; i < arguments.length; i++) {
    var source = null != arguments[i] ? arguments[i] : {};
    i % 2 ? ownKeys$6(Object(source), true).forEach(function(key) {
      _defineProperty(target, key, source[key]);
    }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)) : ownKeys$6(Object(source)).forEach(function(key) {
      Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key));
    });
  }
  return target;
}
function defer() {
  var res;
  var rej;
  var promise = new Promise(function(resolve, reject) {
    res = resolve;
    rej = reject;
  });
  promise.resolve = res;
  promise.reject = rej;
  return promise;
}
function makeString(object) {
  if (object == null)
    return "";
  return "" + object;
}
function copy(a, s, t2) {
  a.forEach(function(m) {
    if (s[m])
      t2[m] = s[m];
  });
}
function getLastOfPath(object, path, Empty) {
  function cleanKey(key2) {
    return key2 && key2.indexOf("###") > -1 ? key2.replace(/###/g, ".") : key2;
  }
  function canNotTraverseDeeper() {
    return !object || typeof object === "string";
  }
  var stack = typeof path !== "string" ? [].concat(path) : path.split(".");
  while (stack.length > 1) {
    if (canNotTraverseDeeper())
      return {};
    var key = cleanKey(stack.shift());
    if (!object[key] && Empty)
      object[key] = new Empty();
    if (Object.prototype.hasOwnProperty.call(object, key)) {
      object = object[key];
    } else {
      object = {};
    }
  }
  if (canNotTraverseDeeper())
    return {};
  return {
    obj: object,
    k: cleanKey(stack.shift())
  };
}
function setPath(object, path, newValue) {
  var _getLastOfPath = getLastOfPath(object, path, Object), obj = _getLastOfPath.obj, k = _getLastOfPath.k;
  obj[k] = newValue;
}
function pushPath(object, path, newValue, concat) {
  var _getLastOfPath2 = getLastOfPath(object, path, Object), obj = _getLastOfPath2.obj, k = _getLastOfPath2.k;
  obj[k] = obj[k] || [];
  if (concat)
    obj[k] = obj[k].concat(newValue);
  if (!concat)
    obj[k].push(newValue);
}
function getPath(object, path) {
  var _getLastOfPath3 = getLastOfPath(object, path), obj = _getLastOfPath3.obj, k = _getLastOfPath3.k;
  if (!obj)
    return void 0;
  return obj[k];
}
function getPathWithDefaults(data, defaultData, key) {
  var value = getPath(data, key);
  if (value !== void 0) {
    return value;
  }
  return getPath(defaultData, key);
}
function deepExtend(target, source, overwrite) {
  for (var prop in source) {
    if (prop !== "__proto__" && prop !== "constructor") {
      if (prop in target) {
        if (typeof target[prop] === "string" || target[prop] instanceof String || typeof source[prop] === "string" || source[prop] instanceof String) {
          if (overwrite)
            target[prop] = source[prop];
        } else {
          deepExtend(target[prop], source[prop], overwrite);
        }
      } else {
        target[prop] = source[prop];
      }
    }
  }
  return target;
}
function regexEscape(str) {
  return str.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&");
}
function escape(data) {
  if (typeof data === "string") {
    return data.replace(/[&<>"'\/]/g, function(s) {
      return _entityMap[s];
    });
  }
  return data;
}
function looksLikeObjectPath(key, nsSeparator, keySeparator) {
  nsSeparator = nsSeparator || "";
  keySeparator = keySeparator || "";
  var possibleChars = chars.filter(function(c) {
    return nsSeparator.indexOf(c) < 0 && keySeparator.indexOf(c) < 0;
  });
  if (possibleChars.length === 0)
    return true;
  var r = new RegExp("(".concat(possibleChars.map(function(c) {
    return c === "?" ? "\\?" : c;
  }).join("|"), ")"));
  var matched = !r.test(key);
  if (!matched) {
    var ki = key.indexOf(keySeparator);
    if (ki > 0 && !r.test(key.substring(0, ki))) {
      matched = true;
    }
  }
  return matched;
}
function deepFind(obj, path) {
  var keySeparator = arguments.length > 2 && arguments[2] !== void 0 ? arguments[2] : ".";
  if (!obj)
    return void 0;
  if (obj[path])
    return obj[path];
  var paths = path.split(keySeparator);
  var current = obj;
  for (var i = 0; i < paths.length; ++i) {
    if (!current)
      return void 0;
    if (typeof current[paths[i]] === "string" && i + 1 < paths.length) {
      return void 0;
    }
    if (current[paths[i]] === void 0) {
      var j = 2;
      var p = paths.slice(i, i + j).join(keySeparator);
      var mix = current[p];
      while (mix === void 0 && paths.length > i + j) {
        j++;
        p = paths.slice(i, i + j).join(keySeparator);
        mix = current[p];
      }
      if (mix === void 0)
        return void 0;
      if (mix === null)
        return null;
      if (path.endsWith(p)) {
        if (typeof mix === "string")
          return mix;
        if (p && typeof mix[p] === "string")
          return mix[p];
      }
      var joinedPath = paths.slice(i + j).join(keySeparator);
      if (joinedPath)
        return deepFind(mix, joinedPath, keySeparator);
      return void 0;
    }
    current = current[paths[i]];
  }
  return current;
}
function ownKeys$5(object, enumerableOnly) {
  var keys = Object.keys(object);
  if (Object.getOwnPropertySymbols) {
    var symbols = Object.getOwnPropertySymbols(object);
    enumerableOnly && (symbols = symbols.filter(function(sym) {
      return Object.getOwnPropertyDescriptor(object, sym).enumerable;
    })), keys.push.apply(keys, symbols);
  }
  return keys;
}
function _objectSpread$5(target) {
  for (var i = 1; i < arguments.length; i++) {
    var source = null != arguments[i] ? arguments[i] : {};
    i % 2 ? ownKeys$5(Object(source), true).forEach(function(key) {
      _defineProperty(target, key, source[key]);
    }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)) : ownKeys$5(Object(source)).forEach(function(key) {
      Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key));
    });
  }
  return target;
}
function _createSuper$3(Derived) {
  var hasNativeReflectConstruct = _isNativeReflectConstruct$3();
  return function _createSuperInternal() {
    var Super = _getPrototypeOf(Derived), result;
    if (hasNativeReflectConstruct) {
      var NewTarget = _getPrototypeOf(this).constructor;
      result = Reflect.construct(Super, arguments, NewTarget);
    } else {
      result = Super.apply(this, arguments);
    }
    return _possibleConstructorReturn(this, result);
  };
}
function _isNativeReflectConstruct$3() {
  if (typeof Reflect === "undefined" || !Reflect.construct)
    return false;
  if (Reflect.construct.sham)
    return false;
  if (typeof Proxy === "function")
    return true;
  try {
    Boolean.prototype.valueOf.call(Reflect.construct(Boolean, [], function() {
    }));
    return true;
  } catch (e) {
    return false;
  }
}
function ownKeys$4(object, enumerableOnly) {
  var keys = Object.keys(object);
  if (Object.getOwnPropertySymbols) {
    var symbols = Object.getOwnPropertySymbols(object);
    enumerableOnly && (symbols = symbols.filter(function(sym) {
      return Object.getOwnPropertyDescriptor(object, sym).enumerable;
    })), keys.push.apply(keys, symbols);
  }
  return keys;
}
function _objectSpread$4(target) {
  for (var i = 1; i < arguments.length; i++) {
    var source = null != arguments[i] ? arguments[i] : {};
    i % 2 ? ownKeys$4(Object(source), true).forEach(function(key) {
      _defineProperty(target, key, source[key]);
    }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)) : ownKeys$4(Object(source)).forEach(function(key) {
      Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key));
    });
  }
  return target;
}
function _createSuper$2(Derived) {
  var hasNativeReflectConstruct = _isNativeReflectConstruct$2();
  return function _createSuperInternal() {
    var Super = _getPrototypeOf(Derived), result;
    if (hasNativeReflectConstruct) {
      var NewTarget = _getPrototypeOf(this).constructor;
      result = Reflect.construct(Super, arguments, NewTarget);
    } else {
      result = Super.apply(this, arguments);
    }
    return _possibleConstructorReturn(this, result);
  };
}
function _isNativeReflectConstruct$2() {
  if (typeof Reflect === "undefined" || !Reflect.construct)
    return false;
  if (Reflect.construct.sham)
    return false;
  if (typeof Proxy === "function")
    return true;
  try {
    Boolean.prototype.valueOf.call(Reflect.construct(Boolean, [], function() {
    }));
    return true;
  } catch (e) {
    return false;
  }
}
function capitalize(string) {
  return string.charAt(0).toUpperCase() + string.slice(1);
}
function createRules() {
  var rules = {};
  sets.forEach(function(set) {
    set.lngs.forEach(function(l) {
      rules[l] = {
        numbers: set.nr,
        plurals: _rulesPluralsTypes[set.fc]
      };
    });
  });
  return rules;
}
function ownKeys$3(object, enumerableOnly) {
  var keys = Object.keys(object);
  if (Object.getOwnPropertySymbols) {
    var symbols = Object.getOwnPropertySymbols(object);
    enumerableOnly && (symbols = symbols.filter(function(sym) {
      return Object.getOwnPropertyDescriptor(object, sym).enumerable;
    })), keys.push.apply(keys, symbols);
  }
  return keys;
}
function _objectSpread$3(target) {
  for (var i = 1; i < arguments.length; i++) {
    var source = null != arguments[i] ? arguments[i] : {};
    i % 2 ? ownKeys$3(Object(source), true).forEach(function(key) {
      _defineProperty(target, key, source[key]);
    }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)) : ownKeys$3(Object(source)).forEach(function(key) {
      Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key));
    });
  }
  return target;
}
function deepFindWithDefaults(data, defaultData, key) {
  var keySeparator = arguments.length > 3 && arguments[3] !== void 0 ? arguments[3] : ".";
  var ignoreJSONStructure = arguments.length > 4 && arguments[4] !== void 0 ? arguments[4] : true;
  var path = getPathWithDefaults(data, defaultData, key);
  if (!path && ignoreJSONStructure && typeof key === "string") {
    path = deepFind(data, key, keySeparator);
    if (path === void 0)
      path = deepFind(defaultData, key, keySeparator);
  }
  return path;
}
function ownKeys$2(object, enumerableOnly) {
  var keys = Object.keys(object);
  if (Object.getOwnPropertySymbols) {
    var symbols = Object.getOwnPropertySymbols(object);
    enumerableOnly && (symbols = symbols.filter(function(sym) {
      return Object.getOwnPropertyDescriptor(object, sym).enumerable;
    })), keys.push.apply(keys, symbols);
  }
  return keys;
}
function _objectSpread$2(target) {
  for (var i = 1; i < arguments.length; i++) {
    var source = null != arguments[i] ? arguments[i] : {};
    i % 2 ? ownKeys$2(Object(source), true).forEach(function(key) {
      _defineProperty(target, key, source[key]);
    }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)) : ownKeys$2(Object(source)).forEach(function(key) {
      Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key));
    });
  }
  return target;
}
function parseFormatStr(formatStr) {
  var formatName = formatStr.toLowerCase().trim();
  var formatOptions = {};
  if (formatStr.indexOf("(") > -1) {
    var p = formatStr.split("(");
    formatName = p[0].toLowerCase().trim();
    var optStr = p[1].substring(0, p[1].length - 1);
    if (formatName === "currency" && optStr.indexOf(":") < 0) {
      if (!formatOptions.currency)
        formatOptions.currency = optStr.trim();
    } else if (formatName === "relativetime" && optStr.indexOf(":") < 0) {
      if (!formatOptions.range)
        formatOptions.range = optStr.trim();
    } else {
      var opts = optStr.split(";");
      opts.forEach(function(opt) {
        if (!opt)
          return;
        var _opt$split = opt.split(":"), _opt$split2 = _toArray(_opt$split), key = _opt$split2[0], rest = _opt$split2.slice(1);
        var val = rest.join(":").trim().replace(/^'+|'+$/g, "");
        if (!formatOptions[key.trim()])
          formatOptions[key.trim()] = val;
        if (val === "false")
          formatOptions[key.trim()] = false;
        if (val === "true")
          formatOptions[key.trim()] = true;
        if (!isNaN(val))
          formatOptions[key.trim()] = parseInt(val, 10);
      });
    }
  }
  return {
    formatName,
    formatOptions
  };
}
function createCachedFormatter(fn) {
  var cache2 = {};
  return function invokeFormatter(val, lng, options) {
    var key = lng + JSON.stringify(options);
    var formatter = cache2[key];
    if (!formatter) {
      formatter = fn(lng, options);
      cache2[key] = formatter;
    }
    return formatter(val);
  };
}
function ownKeys$1(object, enumerableOnly) {
  var keys = Object.keys(object);
  if (Object.getOwnPropertySymbols) {
    var symbols = Object.getOwnPropertySymbols(object);
    enumerableOnly && (symbols = symbols.filter(function(sym) {
      return Object.getOwnPropertyDescriptor(object, sym).enumerable;
    })), keys.push.apply(keys, symbols);
  }
  return keys;
}
function _objectSpread$1(target) {
  for (var i = 1; i < arguments.length; i++) {
    var source = null != arguments[i] ? arguments[i] : {};
    i % 2 ? ownKeys$1(Object(source), true).forEach(function(key) {
      _defineProperty(target, key, source[key]);
    }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)) : ownKeys$1(Object(source)).forEach(function(key) {
      Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key));
    });
  }
  return target;
}
function _createSuper$1(Derived) {
  var hasNativeReflectConstruct = _isNativeReflectConstruct$1();
  return function _createSuperInternal() {
    var Super = _getPrototypeOf(Derived), result;
    if (hasNativeReflectConstruct) {
      var NewTarget = _getPrototypeOf(this).constructor;
      result = Reflect.construct(Super, arguments, NewTarget);
    } else {
      result = Super.apply(this, arguments);
    }
    return _possibleConstructorReturn(this, result);
  };
}
function _isNativeReflectConstruct$1() {
  if (typeof Reflect === "undefined" || !Reflect.construct)
    return false;
  if (Reflect.construct.sham)
    return false;
  if (typeof Proxy === "function")
    return true;
  try {
    Boolean.prototype.valueOf.call(Reflect.construct(Boolean, [], function() {
    }));
    return true;
  } catch (e) {
    return false;
  }
}
function removePending(q, name) {
  if (q.pending[name] !== void 0) {
    delete q.pending[name];
    q.pendingCount--;
  }
}
function get() {
  return {
    debug: false,
    initImmediate: true,
    ns: ["translation"],
    defaultNS: ["translation"],
    fallbackLng: ["dev"],
    fallbackNS: false,
    supportedLngs: false,
    nonExplicitSupportedLngs: false,
    load: "all",
    preload: false,
    simplifyPluralSuffix: true,
    keySeparator: ".",
    nsSeparator: ":",
    pluralSeparator: "_",
    contextSeparator: "_",
    partialBundledLanguages: false,
    saveMissing: false,
    updateMissing: false,
    saveMissingTo: "fallback",
    saveMissingPlurals: true,
    missingKeyHandler: false,
    missingInterpolationHandler: false,
    postProcess: false,
    postProcessPassResolved: false,
    returnNull: true,
    returnEmptyString: true,
    returnObjects: false,
    joinArrays: false,
    returnedObjectHandler: false,
    parseMissingKeyHandler: false,
    appendNamespaceToMissingKey: false,
    appendNamespaceToCIMode: false,
    overloadTranslationOptionHandler: function handle2(args) {
      var ret = {};
      if (_typeof(args[1]) === "object")
        ret = args[1];
      if (typeof args[1] === "string")
        ret.defaultValue = args[1];
      if (typeof args[2] === "string")
        ret.tDescription = args[2];
      if (_typeof(args[2]) === "object" || _typeof(args[3]) === "object") {
        var options = args[3] || args[2];
        Object.keys(options).forEach(function(key) {
          ret[key] = options[key];
        });
      }
      return ret;
    },
    interpolation: {
      escapeValue: true,
      format: function format(value, _format, lng, options) {
        return value;
      },
      prefix: "{{",
      suffix: "}}",
      formatSeparator: ",",
      unescapePrefix: "-",
      nestingPrefix: "$t(",
      nestingSuffix: ")",
      nestingOptionsSeparator: ",",
      maxReplaces: 1e3,
      skipOnVariables: true
    }
  };
}
function transformOptions(options) {
  if (typeof options.ns === "string")
    options.ns = [options.ns];
  if (typeof options.fallbackLng === "string")
    options.fallbackLng = [options.fallbackLng];
  if (typeof options.fallbackNS === "string")
    options.fallbackNS = [options.fallbackNS];
  if (options.supportedLngs && options.supportedLngs.indexOf("cimode") < 0) {
    options.supportedLngs = options.supportedLngs.concat(["cimode"]);
  }
  return options;
}
function ownKeys(object, enumerableOnly) {
  var keys = Object.keys(object);
  if (Object.getOwnPropertySymbols) {
    var symbols = Object.getOwnPropertySymbols(object);
    enumerableOnly && (symbols = symbols.filter(function(sym) {
      return Object.getOwnPropertyDescriptor(object, sym).enumerable;
    })), keys.push.apply(keys, symbols);
  }
  return keys;
}
function _objectSpread(target) {
  for (var i = 1; i < arguments.length; i++) {
    var source = null != arguments[i] ? arguments[i] : {};
    i % 2 ? ownKeys(Object(source), true).forEach(function(key) {
      _defineProperty(target, key, source[key]);
    }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)) : ownKeys(Object(source)).forEach(function(key) {
      Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key));
    });
  }
  return target;
}
function _createSuper(Derived) {
  var hasNativeReflectConstruct = _isNativeReflectConstruct();
  return function _createSuperInternal() {
    var Super = _getPrototypeOf(Derived), result;
    if (hasNativeReflectConstruct) {
      var NewTarget = _getPrototypeOf(this).constructor;
      result = Reflect.construct(Super, arguments, NewTarget);
    } else {
      result = Super.apply(this, arguments);
    }
    return _possibleConstructorReturn(this, result);
  };
}
function _isNativeReflectConstruct() {
  if (typeof Reflect === "undefined" || !Reflect.construct)
    return false;
  if (Reflect.construct.sham)
    return false;
  if (typeof Proxy === "function")
    return true;
  try {
    Boolean.prototype.valueOf.call(Reflect.construct(Boolean, [], function() {
    }));
    return true;
  } catch (e) {
    return false;
  }
}
function noop() {
}
function bindMemberFunctions(inst) {
  var mems = Object.getOwnPropertyNames(Object.getPrototypeOf(inst));
  mems.forEach(function(mem) {
    if (typeof inst[mem] === "function") {
      inst[mem] = inst[mem].bind(inst);
    }
  });
}
var consoleLogger, Logger, baseLogger, EventEmitter, _entityMap, isIE10, chars, ResourceStore, postProcessor, checkedLoadedFor, Translator, LanguageUtil, sets, _rulesPluralsTypes, deprecatedJsonVersions, suffixesOrder, PluralResolver, Interpolator, Formatter, Connector, I18n, instance, createInstance, dir, init, loadResources, reloadResources, use, changeLanguage, getFixedT, t, exists, setDefaultNamespace, hasLoadedNamespace, loadNamespaces, loadLanguages;
var init_i18next = __esm({
  "node_modules/i18next/dist/esm/i18next.js"() {
    init_typeof();
    init_classCallCheck();
    init_createClass();
    init_assertThisInitialized();
    init_inherits();
    init_possibleConstructorReturn();
    init_getPrototypeOf();
    init_defineProperty();
    init_toArray();
    consoleLogger = {
      type: "logger",
      log: function log(args) {
        this.output("log", args);
      },
      warn: function warn(args) {
        this.output("warn", args);
      },
      error: function error(args) {
        this.output("error", args);
      },
      output: function output(type, args) {
        if (console && console[type])
          console[type].apply(console, args);
      }
    };
    Logger = function() {
      function Logger2(concreteLogger) {
        var options = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : {};
        _classCallCheck(this, Logger2);
        this.init(concreteLogger, options);
      }
      _createClass(Logger2, [{
        key: "init",
        value: function init2(concreteLogger) {
          var options = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : {};
          this.prefix = options.prefix || "i18next:";
          this.logger = concreteLogger || consoleLogger;
          this.options = options;
          this.debug = options.debug;
        }
      }, {
        key: "setDebug",
        value: function setDebug(bool) {
          this.debug = bool;
        }
      }, {
        key: "log",
        value: function log2() {
          for (var _len = arguments.length, args = new Array(_len), _key = 0; _key < _len; _key++) {
            args[_key] = arguments[_key];
          }
          return this.forward(args, "log", "", true);
        }
      }, {
        key: "warn",
        value: function warn2() {
          for (var _len2 = arguments.length, args = new Array(_len2), _key2 = 0; _key2 < _len2; _key2++) {
            args[_key2] = arguments[_key2];
          }
          return this.forward(args, "warn", "", true);
        }
      }, {
        key: "error",
        value: function error2() {
          for (var _len3 = arguments.length, args = new Array(_len3), _key3 = 0; _key3 < _len3; _key3++) {
            args[_key3] = arguments[_key3];
          }
          return this.forward(args, "error", "");
        }
      }, {
        key: "deprecate",
        value: function deprecate() {
          for (var _len4 = arguments.length, args = new Array(_len4), _key4 = 0; _key4 < _len4; _key4++) {
            args[_key4] = arguments[_key4];
          }
          return this.forward(args, "warn", "WARNING DEPRECATED: ", true);
        }
      }, {
        key: "forward",
        value: function forward(args, lvl, prefix, debugOnly) {
          if (debugOnly && !this.debug)
            return null;
          if (typeof args[0] === "string")
            args[0] = "".concat(prefix).concat(this.prefix, " ").concat(args[0]);
          return this.logger[lvl](args);
        }
      }, {
        key: "create",
        value: function create(moduleName) {
          return new Logger2(this.logger, _objectSpread$6(_objectSpread$6({}, {
            prefix: "".concat(this.prefix, ":").concat(moduleName, ":")
          }), this.options));
        }
      }, {
        key: "clone",
        value: function clone(options) {
          options = options || this.options;
          options.prefix = options.prefix || this.prefix;
          return new Logger2(this.logger, options);
        }
      }]);
      return Logger2;
    }();
    baseLogger = new Logger();
    EventEmitter = function() {
      function EventEmitter2() {
        _classCallCheck(this, EventEmitter2);
        this.observers = {};
      }
      _createClass(EventEmitter2, [{
        key: "on",
        value: function on(events, listener) {
          var _this = this;
          events.split(" ").forEach(function(event) {
            _this.observers[event] = _this.observers[event] || [];
            _this.observers[event].push(listener);
          });
          return this;
        }
      }, {
        key: "off",
        value: function off(event, listener) {
          if (!this.observers[event])
            return;
          if (!listener) {
            delete this.observers[event];
            return;
          }
          this.observers[event] = this.observers[event].filter(function(l) {
            return l !== listener;
          });
        }
      }, {
        key: "emit",
        value: function emit(event) {
          for (var _len = arguments.length, args = new Array(_len > 1 ? _len - 1 : 0), _key = 1; _key < _len; _key++) {
            args[_key - 1] = arguments[_key];
          }
          if (this.observers[event]) {
            var cloned = [].concat(this.observers[event]);
            cloned.forEach(function(observer) {
              observer.apply(void 0, args);
            });
          }
          if (this.observers["*"]) {
            var _cloned = [].concat(this.observers["*"]);
            _cloned.forEach(function(observer) {
              observer.apply(observer, [event].concat(args));
            });
          }
        }
      }]);
      return EventEmitter2;
    }();
    _entityMap = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
      "/": "&#x2F;"
    };
    isIE10 = typeof window !== "undefined" && window.navigator && typeof window.navigator.userAgentData === "undefined" && window.navigator.userAgent && window.navigator.userAgent.indexOf("MSIE") > -1;
    chars = [" ", ",", "?", "!", ";"];
    ResourceStore = function(_EventEmitter) {
      _inherits(ResourceStore2, _EventEmitter);
      var _super = _createSuper$3(ResourceStore2);
      function ResourceStore2(data) {
        var _this;
        var options = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : {
          ns: ["translation"],
          defaultNS: "translation"
        };
        _classCallCheck(this, ResourceStore2);
        _this = _super.call(this);
        if (isIE10) {
          EventEmitter.call(_assertThisInitialized(_this));
        }
        _this.data = data || {};
        _this.options = options;
        if (_this.options.keySeparator === void 0) {
          _this.options.keySeparator = ".";
        }
        if (_this.options.ignoreJSONStructure === void 0) {
          _this.options.ignoreJSONStructure = true;
        }
        return _this;
      }
      _createClass(ResourceStore2, [{
        key: "addNamespaces",
        value: function addNamespaces(ns) {
          if (this.options.ns.indexOf(ns) < 0) {
            this.options.ns.push(ns);
          }
        }
      }, {
        key: "removeNamespaces",
        value: function removeNamespaces(ns) {
          var index = this.options.ns.indexOf(ns);
          if (index > -1) {
            this.options.ns.splice(index, 1);
          }
        }
      }, {
        key: "getResource",
        value: function getResource(lng, ns, key) {
          var options = arguments.length > 3 && arguments[3] !== void 0 ? arguments[3] : {};
          var keySeparator = options.keySeparator !== void 0 ? options.keySeparator : this.options.keySeparator;
          var ignoreJSONStructure = options.ignoreJSONStructure !== void 0 ? options.ignoreJSONStructure : this.options.ignoreJSONStructure;
          var path = [lng, ns];
          if (key && typeof key !== "string")
            path = path.concat(key);
          if (key && typeof key === "string")
            path = path.concat(keySeparator ? key.split(keySeparator) : key);
          if (lng.indexOf(".") > -1) {
            path = lng.split(".");
          }
          var result = getPath(this.data, path);
          if (result || !ignoreJSONStructure || typeof key !== "string")
            return result;
          return deepFind(this.data && this.data[lng] && this.data[lng][ns], key, keySeparator);
        }
      }, {
        key: "addResource",
        value: function addResource(lng, ns, key, value) {
          var options = arguments.length > 4 && arguments[4] !== void 0 ? arguments[4] : {
            silent: false
          };
          var keySeparator = this.options.keySeparator;
          if (keySeparator === void 0)
            keySeparator = ".";
          var path = [lng, ns];
          if (key)
            path = path.concat(keySeparator ? key.split(keySeparator) : key);
          if (lng.indexOf(".") > -1) {
            path = lng.split(".");
            value = ns;
            ns = path[1];
          }
          this.addNamespaces(ns);
          setPath(this.data, path, value);
          if (!options.silent)
            this.emit("added", lng, ns, key, value);
        }
      }, {
        key: "addResources",
        value: function addResources(lng, ns, resources) {
          var options = arguments.length > 3 && arguments[3] !== void 0 ? arguments[3] : {
            silent: false
          };
          for (var m in resources) {
            if (typeof resources[m] === "string" || Object.prototype.toString.apply(resources[m]) === "[object Array]")
              this.addResource(lng, ns, m, resources[m], {
                silent: true
              });
          }
          if (!options.silent)
            this.emit("added", lng, ns, resources);
        }
      }, {
        key: "addResourceBundle",
        value: function addResourceBundle(lng, ns, resources, deep, overwrite) {
          var options = arguments.length > 5 && arguments[5] !== void 0 ? arguments[5] : {
            silent: false
          };
          var path = [lng, ns];
          if (lng.indexOf(".") > -1) {
            path = lng.split(".");
            deep = resources;
            resources = ns;
            ns = path[1];
          }
          this.addNamespaces(ns);
          var pack = getPath(this.data, path) || {};
          if (deep) {
            deepExtend(pack, resources, overwrite);
          } else {
            pack = _objectSpread$5(_objectSpread$5({}, pack), resources);
          }
          setPath(this.data, path, pack);
          if (!options.silent)
            this.emit("added", lng, ns, resources);
        }
      }, {
        key: "removeResourceBundle",
        value: function removeResourceBundle(lng, ns) {
          if (this.hasResourceBundle(lng, ns)) {
            delete this.data[lng][ns];
          }
          this.removeNamespaces(ns);
          this.emit("removed", lng, ns);
        }
      }, {
        key: "hasResourceBundle",
        value: function hasResourceBundle(lng, ns) {
          return this.getResource(lng, ns) !== void 0;
        }
      }, {
        key: "getResourceBundle",
        value: function getResourceBundle(lng, ns) {
          if (!ns)
            ns = this.options.defaultNS;
          if (this.options.compatibilityAPI === "v1")
            return _objectSpread$5(_objectSpread$5({}, {}), this.getResource(lng, ns));
          return this.getResource(lng, ns);
        }
      }, {
        key: "getDataByLanguage",
        value: function getDataByLanguage(lng) {
          return this.data[lng];
        }
      }, {
        key: "hasLanguageSomeTranslations",
        value: function hasLanguageSomeTranslations(lng) {
          var data = this.getDataByLanguage(lng);
          var n = data && Object.keys(data) || [];
          return !!n.find(function(v) {
            return data[v] && Object.keys(data[v]).length > 0;
          });
        }
      }, {
        key: "toJSON",
        value: function toJSON() {
          return this.data;
        }
      }]);
      return ResourceStore2;
    }(EventEmitter);
    postProcessor = {
      processors: {},
      addPostProcessor: function addPostProcessor(module) {
        this.processors[module.name] = module;
      },
      handle: function handle(processors, value, key, options, translator) {
        var _this = this;
        processors.forEach(function(processor) {
          if (_this.processors[processor])
            value = _this.processors[processor].process(value, key, options, translator);
        });
        return value;
      }
    };
    checkedLoadedFor = {};
    Translator = function(_EventEmitter) {
      _inherits(Translator2, _EventEmitter);
      var _super = _createSuper$2(Translator2);
      function Translator2(services) {
        var _this;
        var options = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : {};
        _classCallCheck(this, Translator2);
        _this = _super.call(this);
        if (isIE10) {
          EventEmitter.call(_assertThisInitialized(_this));
        }
        copy(["resourceStore", "languageUtils", "pluralResolver", "interpolator", "backendConnector", "i18nFormat", "utils"], services, _assertThisInitialized(_this));
        _this.options = options;
        if (_this.options.keySeparator === void 0) {
          _this.options.keySeparator = ".";
        }
        _this.logger = baseLogger.create("translator");
        return _this;
      }
      _createClass(Translator2, [{
        key: "changeLanguage",
        value: function changeLanguage2(lng) {
          if (lng)
            this.language = lng;
        }
      }, {
        key: "exists",
        value: function exists2(key) {
          var options = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : {
            interpolation: {}
          };
          if (key === void 0 || key === null) {
            return false;
          }
          var resolved = this.resolve(key, options);
          return resolved && resolved.res !== void 0;
        }
      }, {
        key: "extractFromKey",
        value: function extractFromKey(key, options) {
          var nsSeparator = options.nsSeparator !== void 0 ? options.nsSeparator : this.options.nsSeparator;
          if (nsSeparator === void 0)
            nsSeparator = ":";
          var keySeparator = options.keySeparator !== void 0 ? options.keySeparator : this.options.keySeparator;
          var namespaces = options.ns || this.options.defaultNS || [];
          var wouldCheckForNsInKey = nsSeparator && key.indexOf(nsSeparator) > -1;
          var seemsNaturalLanguage = !this.options.userDefinedKeySeparator && !options.keySeparator && !this.options.userDefinedNsSeparator && !options.nsSeparator && !looksLikeObjectPath(key, nsSeparator, keySeparator);
          if (wouldCheckForNsInKey && !seemsNaturalLanguage) {
            var m = key.match(this.interpolator.nestingRegexp);
            if (m && m.length > 0) {
              return {
                key,
                namespaces
              };
            }
            var parts = key.split(nsSeparator);
            if (nsSeparator !== keySeparator || nsSeparator === keySeparator && this.options.ns.indexOf(parts[0]) > -1)
              namespaces = parts.shift();
            key = parts.join(keySeparator);
          }
          if (typeof namespaces === "string")
            namespaces = [namespaces];
          return {
            key,
            namespaces
          };
        }
      }, {
        key: "translate",
        value: function translate(keys, options, lastKey) {
          var _this2 = this;
          if (_typeof(options) !== "object" && this.options.overloadTranslationOptionHandler) {
            options = this.options.overloadTranslationOptionHandler(arguments);
          }
          if (_typeof(options) === "object")
            options = _objectSpread$4({}, options);
          if (!options)
            options = {};
          if (keys === void 0 || keys === null)
            return "";
          if (!Array.isArray(keys))
            keys = [String(keys)];
          var returnDetails = options.returnDetails !== void 0 ? options.returnDetails : this.options.returnDetails;
          var keySeparator = options.keySeparator !== void 0 ? options.keySeparator : this.options.keySeparator;
          var _this$extractFromKey = this.extractFromKey(keys[keys.length - 1], options), key = _this$extractFromKey.key, namespaces = _this$extractFromKey.namespaces;
          var namespace = namespaces[namespaces.length - 1];
          var lng = options.lng || this.language;
          var appendNamespaceToCIMode = options.appendNamespaceToCIMode || this.options.appendNamespaceToCIMode;
          if (lng && lng.toLowerCase() === "cimode") {
            if (appendNamespaceToCIMode) {
              var nsSeparator = options.nsSeparator || this.options.nsSeparator;
              if (returnDetails) {
                return {
                  res: "".concat(namespace).concat(nsSeparator).concat(key),
                  usedKey: key,
                  exactUsedKey: key,
                  usedLng: lng,
                  usedNS: namespace
                };
              }
              return "".concat(namespace).concat(nsSeparator).concat(key);
            }
            if (returnDetails) {
              return {
                res: key,
                usedKey: key,
                exactUsedKey: key,
                usedLng: lng,
                usedNS: namespace
              };
            }
            return key;
          }
          var resolved = this.resolve(keys, options);
          var res = resolved && resolved.res;
          var resUsedKey = resolved && resolved.usedKey || key;
          var resExactUsedKey = resolved && resolved.exactUsedKey || key;
          var resType = Object.prototype.toString.apply(res);
          var noObject = ["[object Number]", "[object Function]", "[object RegExp]"];
          var joinArrays = options.joinArrays !== void 0 ? options.joinArrays : this.options.joinArrays;
          var handleAsObjectInI18nFormat = !this.i18nFormat || this.i18nFormat.handleAsObject;
          var handleAsObject = typeof res !== "string" && typeof res !== "boolean" && typeof res !== "number";
          if (handleAsObjectInI18nFormat && res && handleAsObject && noObject.indexOf(resType) < 0 && !(typeof joinArrays === "string" && resType === "[object Array]")) {
            if (!options.returnObjects && !this.options.returnObjects) {
              if (!this.options.returnedObjectHandler) {
                this.logger.warn("accessing an object - but returnObjects options is not enabled!");
              }
              var r = this.options.returnedObjectHandler ? this.options.returnedObjectHandler(resUsedKey, res, _objectSpread$4(_objectSpread$4({}, options), {}, {
                ns: namespaces
              })) : "key '".concat(key, " (").concat(this.language, ")' returned an object instead of string.");
              if (returnDetails) {
                resolved.res = r;
                return resolved;
              }
              return r;
            }
            if (keySeparator) {
              var resTypeIsArray = resType === "[object Array]";
              var copy2 = resTypeIsArray ? [] : {};
              var newKeyToUse = resTypeIsArray ? resExactUsedKey : resUsedKey;
              for (var m in res) {
                if (Object.prototype.hasOwnProperty.call(res, m)) {
                  var deepKey = "".concat(newKeyToUse).concat(keySeparator).concat(m);
                  copy2[m] = this.translate(deepKey, _objectSpread$4(_objectSpread$4({}, options), {
                    joinArrays: false,
                    ns: namespaces
                  }));
                  if (copy2[m] === deepKey)
                    copy2[m] = res[m];
                }
              }
              res = copy2;
            }
          } else if (handleAsObjectInI18nFormat && typeof joinArrays === "string" && resType === "[object Array]") {
            res = res.join(joinArrays);
            if (res)
              res = this.extendTranslation(res, keys, options, lastKey);
          } else {
            var usedDefault = false;
            var usedKey = false;
            var needsPluralHandling = options.count !== void 0 && typeof options.count !== "string";
            var hasDefaultValue = Translator2.hasDefaultValue(options);
            var defaultValueSuffix = needsPluralHandling ? this.pluralResolver.getSuffix(lng, options.count, options) : "";
            var defaultValue = options["defaultValue".concat(defaultValueSuffix)] || options.defaultValue;
            if (!this.isValidLookup(res) && hasDefaultValue) {
              usedDefault = true;
              res = defaultValue;
            }
            if (!this.isValidLookup(res)) {
              usedKey = true;
              res = key;
            }
            var missingKeyNoValueFallbackToKey = options.missingKeyNoValueFallbackToKey || this.options.missingKeyNoValueFallbackToKey;
            var resForMissing = missingKeyNoValueFallbackToKey && usedKey ? void 0 : res;
            var updateMissing = hasDefaultValue && defaultValue !== res && this.options.updateMissing;
            if (usedKey || usedDefault || updateMissing) {
              this.logger.log(updateMissing ? "updateKey" : "missingKey", lng, namespace, key, updateMissing ? defaultValue : res);
              if (keySeparator) {
                var fk = this.resolve(key, _objectSpread$4(_objectSpread$4({}, options), {}, {
                  keySeparator: false
                }));
                if (fk && fk.res)
                  this.logger.warn("Seems the loaded translations were in flat JSON format instead of nested. Either set keySeparator: false on init or make sure your translations are published in nested format.");
              }
              var lngs = [];
              var fallbackLngs = this.languageUtils.getFallbackCodes(this.options.fallbackLng, options.lng || this.language);
              if (this.options.saveMissingTo === "fallback" && fallbackLngs && fallbackLngs[0]) {
                for (var i = 0; i < fallbackLngs.length; i++) {
                  lngs.push(fallbackLngs[i]);
                }
              } else if (this.options.saveMissingTo === "all") {
                lngs = this.languageUtils.toResolveHierarchy(options.lng || this.language);
              } else {
                lngs.push(options.lng || this.language);
              }
              var send = function send2(l, k, specificDefaultValue) {
                var defaultForMissing = hasDefaultValue && specificDefaultValue !== res ? specificDefaultValue : resForMissing;
                if (_this2.options.missingKeyHandler) {
                  _this2.options.missingKeyHandler(l, namespace, k, defaultForMissing, updateMissing, options);
                } else if (_this2.backendConnector && _this2.backendConnector.saveMissing) {
                  _this2.backendConnector.saveMissing(l, namespace, k, defaultForMissing, updateMissing, options);
                }
                _this2.emit("missingKey", l, namespace, k, res);
              };
              if (this.options.saveMissing) {
                if (this.options.saveMissingPlurals && needsPluralHandling) {
                  lngs.forEach(function(language) {
                    _this2.pluralResolver.getSuffixes(language, options).forEach(function(suffix) {
                      send([language], key + suffix, options["defaultValue".concat(suffix)] || defaultValue);
                    });
                  });
                } else {
                  send(lngs, key, defaultValue);
                }
              }
            }
            res = this.extendTranslation(res, keys, options, resolved, lastKey);
            if (usedKey && res === key && this.options.appendNamespaceToMissingKey)
              res = "".concat(namespace, ":").concat(key);
            if ((usedKey || usedDefault) && this.options.parseMissingKeyHandler) {
              if (this.options.compatibilityAPI !== "v1") {
                res = this.options.parseMissingKeyHandler(this.options.appendNamespaceToMissingKey ? "".concat(namespace, ":").concat(key) : key, usedDefault ? res : void 0);
              } else {
                res = this.options.parseMissingKeyHandler(res);
              }
            }
          }
          if (returnDetails) {
            resolved.res = res;
            return resolved;
          }
          return res;
        }
      }, {
        key: "extendTranslation",
        value: function extendTranslation(res, key, options, resolved, lastKey) {
          var _this3 = this;
          if (this.i18nFormat && this.i18nFormat.parse) {
            res = this.i18nFormat.parse(res, _objectSpread$4(_objectSpread$4({}, this.options.interpolation.defaultVariables), options), resolved.usedLng, resolved.usedNS, resolved.usedKey, {
              resolved
            });
          } else if (!options.skipInterpolation) {
            if (options.interpolation)
              this.interpolator.init(_objectSpread$4(_objectSpread$4({}, options), {
                interpolation: _objectSpread$4(_objectSpread$4({}, this.options.interpolation), options.interpolation)
              }));
            var skipOnVariables = typeof res === "string" && (options && options.interpolation && options.interpolation.skipOnVariables !== void 0 ? options.interpolation.skipOnVariables : this.options.interpolation.skipOnVariables);
            var nestBef;
            if (skipOnVariables) {
              var nb = res.match(this.interpolator.nestingRegexp);
              nestBef = nb && nb.length;
            }
            var data = options.replace && typeof options.replace !== "string" ? options.replace : options;
            if (this.options.interpolation.defaultVariables)
              data = _objectSpread$4(_objectSpread$4({}, this.options.interpolation.defaultVariables), data);
            res = this.interpolator.interpolate(res, data, options.lng || this.language, options);
            if (skipOnVariables) {
              var na = res.match(this.interpolator.nestingRegexp);
              var nestAft = na && na.length;
              if (nestBef < nestAft)
                options.nest = false;
            }
            if (!options.lng && this.options.compatibilityAPI !== "v1" && resolved && resolved.res)
              options.lng = resolved.usedLng;
            if (options.nest !== false)
              res = this.interpolator.nest(res, function() {
                for (var _len = arguments.length, args = new Array(_len), _key = 0; _key < _len; _key++) {
                  args[_key] = arguments[_key];
                }
                if (lastKey && lastKey[0] === args[0] && !options.context) {
                  _this3.logger.warn("It seems you are nesting recursively key: ".concat(args[0], " in key: ").concat(key[0]));
                  return null;
                }
                return _this3.translate.apply(_this3, args.concat([key]));
              }, options);
            if (options.interpolation)
              this.interpolator.reset();
          }
          var postProcess = options.postProcess || this.options.postProcess;
          var postProcessorNames = typeof postProcess === "string" ? [postProcess] : postProcess;
          if (res !== void 0 && res !== null && postProcessorNames && postProcessorNames.length && options.applyPostProcessor !== false) {
            res = postProcessor.handle(postProcessorNames, res, key, this.options && this.options.postProcessPassResolved ? _objectSpread$4({
              i18nResolved: resolved
            }, options) : options, this);
          }
          return res;
        }
      }, {
        key: "resolve",
        value: function resolve(keys) {
          var _this4 = this;
          var options = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : {};
          var found;
          var usedKey;
          var exactUsedKey;
          var usedLng;
          var usedNS;
          if (typeof keys === "string")
            keys = [keys];
          keys.forEach(function(k) {
            if (_this4.isValidLookup(found))
              return;
            var extracted = _this4.extractFromKey(k, options);
            var key = extracted.key;
            usedKey = key;
            var namespaces = extracted.namespaces;
            if (_this4.options.fallbackNS)
              namespaces = namespaces.concat(_this4.options.fallbackNS);
            var needsPluralHandling = options.count !== void 0 && typeof options.count !== "string";
            var needsZeroSuffixLookup = needsPluralHandling && !options.ordinal && options.count === 0 && _this4.pluralResolver.shouldUseIntlApi();
            var needsContextHandling = options.context !== void 0 && (typeof options.context === "string" || typeof options.context === "number") && options.context !== "";
            var codes = options.lngs ? options.lngs : _this4.languageUtils.toResolveHierarchy(options.lng || _this4.language, options.fallbackLng);
            namespaces.forEach(function(ns) {
              if (_this4.isValidLookup(found))
                return;
              usedNS = ns;
              if (!checkedLoadedFor["".concat(codes[0], "-").concat(ns)] && _this4.utils && _this4.utils.hasLoadedNamespace && !_this4.utils.hasLoadedNamespace(usedNS)) {
                checkedLoadedFor["".concat(codes[0], "-").concat(ns)] = true;
                _this4.logger.warn('key "'.concat(usedKey, '" for languages "').concat(codes.join(", "), `" won't get resolved as namespace "`).concat(usedNS, '" was not yet loaded'), "This means something IS WRONG in your setup. You access the t function before i18next.init / i18next.loadNamespace / i18next.changeLanguage was done. Wait for the callback or Promise to resolve before accessing it!!!");
              }
              codes.forEach(function(code) {
                if (_this4.isValidLookup(found))
                  return;
                usedLng = code;
                var finalKeys = [key];
                if (_this4.i18nFormat && _this4.i18nFormat.addLookupKeys) {
                  _this4.i18nFormat.addLookupKeys(finalKeys, key, code, ns, options);
                } else {
                  var pluralSuffix;
                  if (needsPluralHandling)
                    pluralSuffix = _this4.pluralResolver.getSuffix(code, options.count, options);
                  var zeroSuffix = "".concat(_this4.options.pluralSeparator, "zero");
                  if (needsPluralHandling) {
                    finalKeys.push(key + pluralSuffix);
                    if (needsZeroSuffixLookup) {
                      finalKeys.push(key + zeroSuffix);
                    }
                  }
                  if (needsContextHandling) {
                    var contextKey = "".concat(key).concat(_this4.options.contextSeparator).concat(options.context);
                    finalKeys.push(contextKey);
                    if (needsPluralHandling) {
                      finalKeys.push(contextKey + pluralSuffix);
                      if (needsZeroSuffixLookup) {
                        finalKeys.push(contextKey + zeroSuffix);
                      }
                    }
                  }
                }
                var possibleKey;
                while (possibleKey = finalKeys.pop()) {
                  if (!_this4.isValidLookup(found)) {
                    exactUsedKey = possibleKey;
                    found = _this4.getResource(code, ns, possibleKey, options);
                  }
                }
              });
            });
          });
          return {
            res: found,
            usedKey,
            exactUsedKey,
            usedLng,
            usedNS
          };
        }
      }, {
        key: "isValidLookup",
        value: function isValidLookup(res) {
          return res !== void 0 && !(!this.options.returnNull && res === null) && !(!this.options.returnEmptyString && res === "");
        }
      }, {
        key: "getResource",
        value: function getResource(code, ns, key) {
          var options = arguments.length > 3 && arguments[3] !== void 0 ? arguments[3] : {};
          if (this.i18nFormat && this.i18nFormat.getResource)
            return this.i18nFormat.getResource(code, ns, key, options);
          return this.resourceStore.getResource(code, ns, key, options);
        }
      }], [{
        key: "hasDefaultValue",
        value: function hasDefaultValue(options) {
          var prefix = "defaultValue";
          for (var option in options) {
            if (Object.prototype.hasOwnProperty.call(options, option) && prefix === option.substring(0, prefix.length) && void 0 !== options[option]) {
              return true;
            }
          }
          return false;
        }
      }]);
      return Translator2;
    }(EventEmitter);
    LanguageUtil = function() {
      function LanguageUtil2(options) {
        _classCallCheck(this, LanguageUtil2);
        this.options = options;
        this.supportedLngs = this.options.supportedLngs || false;
        this.logger = baseLogger.create("languageUtils");
      }
      _createClass(LanguageUtil2, [{
        key: "getScriptPartFromCode",
        value: function getScriptPartFromCode(code) {
          if (!code || code.indexOf("-") < 0)
            return null;
          var p = code.split("-");
          if (p.length === 2)
            return null;
          p.pop();
          if (p[p.length - 1].toLowerCase() === "x")
            return null;
          return this.formatLanguageCode(p.join("-"));
        }
      }, {
        key: "getLanguagePartFromCode",
        value: function getLanguagePartFromCode(code) {
          if (!code || code.indexOf("-") < 0)
            return code;
          var p = code.split("-");
          return this.formatLanguageCode(p[0]);
        }
      }, {
        key: "formatLanguageCode",
        value: function formatLanguageCode(code) {
          if (typeof code === "string" && code.indexOf("-") > -1) {
            var specialCases = ["hans", "hant", "latn", "cyrl", "cans", "mong", "arab"];
            var p = code.split("-");
            if (this.options.lowerCaseLng) {
              p = p.map(function(part) {
                return part.toLowerCase();
              });
            } else if (p.length === 2) {
              p[0] = p[0].toLowerCase();
              p[1] = p[1].toUpperCase();
              if (specialCases.indexOf(p[1].toLowerCase()) > -1)
                p[1] = capitalize(p[1].toLowerCase());
            } else if (p.length === 3) {
              p[0] = p[0].toLowerCase();
              if (p[1].length === 2)
                p[1] = p[1].toUpperCase();
              if (p[0] !== "sgn" && p[2].length === 2)
                p[2] = p[2].toUpperCase();
              if (specialCases.indexOf(p[1].toLowerCase()) > -1)
                p[1] = capitalize(p[1].toLowerCase());
              if (specialCases.indexOf(p[2].toLowerCase()) > -1)
                p[2] = capitalize(p[2].toLowerCase());
            }
            return p.join("-");
          }
          return this.options.cleanCode || this.options.lowerCaseLng ? code.toLowerCase() : code;
        }
      }, {
        key: "isSupportedCode",
        value: function isSupportedCode(code) {
          if (this.options.load === "languageOnly" || this.options.nonExplicitSupportedLngs) {
            code = this.getLanguagePartFromCode(code);
          }
          return !this.supportedLngs || !this.supportedLngs.length || this.supportedLngs.indexOf(code) > -1;
        }
      }, {
        key: "getBestMatchFromCodes",
        value: function getBestMatchFromCodes(codes) {
          var _this = this;
          if (!codes)
            return null;
          var found;
          codes.forEach(function(code) {
            if (found)
              return;
            var cleanedLng = _this.formatLanguageCode(code);
            if (!_this.options.supportedLngs || _this.isSupportedCode(cleanedLng))
              found = cleanedLng;
          });
          if (!found && this.options.supportedLngs) {
            codes.forEach(function(code) {
              if (found)
                return;
              var lngOnly = _this.getLanguagePartFromCode(code);
              if (_this.isSupportedCode(lngOnly))
                return found = lngOnly;
              found = _this.options.supportedLngs.find(function(supportedLng) {
                if (supportedLng === lngOnly)
                  return supportedLng;
                if (supportedLng.indexOf("-") < 0 && lngOnly.indexOf("-") < 0)
                  return;
                if (supportedLng.indexOf(lngOnly) === 0)
                  return supportedLng;
              });
            });
          }
          if (!found)
            found = this.getFallbackCodes(this.options.fallbackLng)[0];
          return found;
        }
      }, {
        key: "getFallbackCodes",
        value: function getFallbackCodes(fallbacks, code) {
          if (!fallbacks)
            return [];
          if (typeof fallbacks === "function")
            fallbacks = fallbacks(code);
          if (typeof fallbacks === "string")
            fallbacks = [fallbacks];
          if (Object.prototype.toString.apply(fallbacks) === "[object Array]")
            return fallbacks;
          if (!code)
            return fallbacks["default"] || [];
          var found = fallbacks[code];
          if (!found)
            found = fallbacks[this.getScriptPartFromCode(code)];
          if (!found)
            found = fallbacks[this.formatLanguageCode(code)];
          if (!found)
            found = fallbacks[this.getLanguagePartFromCode(code)];
          if (!found)
            found = fallbacks["default"];
          return found || [];
        }
      }, {
        key: "toResolveHierarchy",
        value: function toResolveHierarchy(code, fallbackCode) {
          var _this2 = this;
          var fallbackCodes = this.getFallbackCodes(fallbackCode || this.options.fallbackLng || [], code);
          var codes = [];
          var addCode = function addCode2(c) {
            if (!c)
              return;
            if (_this2.isSupportedCode(c)) {
              codes.push(c);
            } else {
              _this2.logger.warn("rejecting language code not found in supportedLngs: ".concat(c));
            }
          };
          if (typeof code === "string" && code.indexOf("-") > -1) {
            if (this.options.load !== "languageOnly")
              addCode(this.formatLanguageCode(code));
            if (this.options.load !== "languageOnly" && this.options.load !== "currentOnly")
              addCode(this.getScriptPartFromCode(code));
            if (this.options.load !== "currentOnly")
              addCode(this.getLanguagePartFromCode(code));
          } else if (typeof code === "string") {
            addCode(this.formatLanguageCode(code));
          }
          fallbackCodes.forEach(function(fc) {
            if (codes.indexOf(fc) < 0)
              addCode(_this2.formatLanguageCode(fc));
          });
          return codes;
        }
      }]);
      return LanguageUtil2;
    }();
    sets = [{
      lngs: ["ach", "ak", "am", "arn", "br", "fil", "gun", "ln", "mfe", "mg", "mi", "oc", "pt", "pt-BR", "tg", "tl", "ti", "tr", "uz", "wa"],
      nr: [1, 2],
      fc: 1
    }, {
      lngs: ["af", "an", "ast", "az", "bg", "bn", "ca", "da", "de", "dev", "el", "en", "eo", "es", "et", "eu", "fi", "fo", "fur", "fy", "gl", "gu", "ha", "hi", "hu", "hy", "ia", "it", "kk", "kn", "ku", "lb", "mai", "ml", "mn", "mr", "nah", "nap", "nb", "ne", "nl", "nn", "no", "nso", "pa", "pap", "pms", "ps", "pt-PT", "rm", "sco", "se", "si", "so", "son", "sq", "sv", "sw", "ta", "te", "tk", "ur", "yo"],
      nr: [1, 2],
      fc: 2
    }, {
      lngs: ["ay", "bo", "cgg", "fa", "ht", "id", "ja", "jbo", "ka", "km", "ko", "ky", "lo", "ms", "sah", "su", "th", "tt", "ug", "vi", "wo", "zh"],
      nr: [1],
      fc: 3
    }, {
      lngs: ["be", "bs", "cnr", "dz", "hr", "ru", "sr", "uk"],
      nr: [1, 2, 5],
      fc: 4
    }, {
      lngs: ["ar"],
      nr: [0, 1, 2, 3, 11, 100],
      fc: 5
    }, {
      lngs: ["cs", "sk"],
      nr: [1, 2, 5],
      fc: 6
    }, {
      lngs: ["csb", "pl"],
      nr: [1, 2, 5],
      fc: 7
    }, {
      lngs: ["cy"],
      nr: [1, 2, 3, 8],
      fc: 8
    }, {
      lngs: ["fr"],
      nr: [1, 2],
      fc: 9
    }, {
      lngs: ["ga"],
      nr: [1, 2, 3, 7, 11],
      fc: 10
    }, {
      lngs: ["gd"],
      nr: [1, 2, 3, 20],
      fc: 11
    }, {
      lngs: ["is"],
      nr: [1, 2],
      fc: 12
    }, {
      lngs: ["jv"],
      nr: [0, 1],
      fc: 13
    }, {
      lngs: ["kw"],
      nr: [1, 2, 3, 4],
      fc: 14
    }, {
      lngs: ["lt"],
      nr: [1, 2, 10],
      fc: 15
    }, {
      lngs: ["lv"],
      nr: [1, 2, 0],
      fc: 16
    }, {
      lngs: ["mk"],
      nr: [1, 2],
      fc: 17
    }, {
      lngs: ["mnk"],
      nr: [0, 1, 2],
      fc: 18
    }, {
      lngs: ["mt"],
      nr: [1, 2, 11, 20],
      fc: 19
    }, {
      lngs: ["or"],
      nr: [2, 1],
      fc: 2
    }, {
      lngs: ["ro"],
      nr: [1, 2, 20],
      fc: 20
    }, {
      lngs: ["sl"],
      nr: [5, 1, 2, 3],
      fc: 21
    }, {
      lngs: ["he", "iw"],
      nr: [1, 2, 20, 21],
      fc: 22
    }];
    _rulesPluralsTypes = {
      1: function _(n) {
        return Number(n > 1);
      },
      2: function _2(n) {
        return Number(n != 1);
      },
      3: function _3(n) {
        return 0;
      },
      4: function _4(n) {
        return Number(n % 10 == 1 && n % 100 != 11 ? 0 : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 1 : 2);
      },
      5: function _5(n) {
        return Number(n == 0 ? 0 : n == 1 ? 1 : n == 2 ? 2 : n % 100 >= 3 && n % 100 <= 10 ? 3 : n % 100 >= 11 ? 4 : 5);
      },
      6: function _6(n) {
        return Number(n == 1 ? 0 : n >= 2 && n <= 4 ? 1 : 2);
      },
      7: function _7(n) {
        return Number(n == 1 ? 0 : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 1 : 2);
      },
      8: function _8(n) {
        return Number(n == 1 ? 0 : n == 2 ? 1 : n != 8 && n != 11 ? 2 : 3);
      },
      9: function _9(n) {
        return Number(n >= 2);
      },
      10: function _10(n) {
        return Number(n == 1 ? 0 : n == 2 ? 1 : n < 7 ? 2 : n < 11 ? 3 : 4);
      },
      11: function _11(n) {
        return Number(n == 1 || n == 11 ? 0 : n == 2 || n == 12 ? 1 : n > 2 && n < 20 ? 2 : 3);
      },
      12: function _12(n) {
        return Number(n % 10 != 1 || n % 100 == 11);
      },
      13: function _13(n) {
        return Number(n !== 0);
      },
      14: function _14(n) {
        return Number(n == 1 ? 0 : n == 2 ? 1 : n == 3 ? 2 : 3);
      },
      15: function _15(n) {
        return Number(n % 10 == 1 && n % 100 != 11 ? 0 : n % 10 >= 2 && (n % 100 < 10 || n % 100 >= 20) ? 1 : 2);
      },
      16: function _16(n) {
        return Number(n % 10 == 1 && n % 100 != 11 ? 0 : n !== 0 ? 1 : 2);
      },
      17: function _17(n) {
        return Number(n == 1 || n % 10 == 1 && n % 100 != 11 ? 0 : 1);
      },
      18: function _18(n) {
        return Number(n == 0 ? 0 : n == 1 ? 1 : 2);
      },
      19: function _19(n) {
        return Number(n == 1 ? 0 : n == 0 || n % 100 > 1 && n % 100 < 11 ? 1 : n % 100 > 10 && n % 100 < 20 ? 2 : 3);
      },
      20: function _20(n) {
        return Number(n == 1 ? 0 : n == 0 || n % 100 > 0 && n % 100 < 20 ? 1 : 2);
      },
      21: function _21(n) {
        return Number(n % 100 == 1 ? 1 : n % 100 == 2 ? 2 : n % 100 == 3 || n % 100 == 4 ? 3 : 0);
      },
      22: function _22(n) {
        return Number(n == 1 ? 0 : n == 2 ? 1 : (n < 0 || n > 10) && n % 10 == 0 ? 2 : 3);
      }
    };
    deprecatedJsonVersions = ["v1", "v2", "v3"];
    suffixesOrder = {
      zero: 0,
      one: 1,
      two: 2,
      few: 3,
      many: 4,
      other: 5
    };
    PluralResolver = function() {
      function PluralResolver2(languageUtils) {
        var options = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : {};
        _classCallCheck(this, PluralResolver2);
        this.languageUtils = languageUtils;
        this.options = options;
        this.logger = baseLogger.create("pluralResolver");
        if ((!this.options.compatibilityJSON || this.options.compatibilityJSON === "v4") && (typeof Intl === "undefined" || !Intl.PluralRules)) {
          this.options.compatibilityJSON = "v3";
          this.logger.error("Your environment seems not to be Intl API compatible, use an Intl.PluralRules polyfill. Will fallback to the compatibilityJSON v3 format handling.");
        }
        this.rules = createRules();
      }
      _createClass(PluralResolver2, [{
        key: "addRule",
        value: function addRule(lng, obj) {
          this.rules[lng] = obj;
        }
      }, {
        key: "getRule",
        value: function getRule(code) {
          var options = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : {};
          if (this.shouldUseIntlApi()) {
            try {
              return new Intl.PluralRules(code, {
                type: options.ordinal ? "ordinal" : "cardinal"
              });
            } catch (_unused) {
              return;
            }
          }
          return this.rules[code] || this.rules[this.languageUtils.getLanguagePartFromCode(code)];
        }
      }, {
        key: "needsPlural",
        value: function needsPlural(code) {
          var options = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : {};
          var rule = this.getRule(code, options);
          if (this.shouldUseIntlApi()) {
            return rule && rule.resolvedOptions().pluralCategories.length > 1;
          }
          return rule && rule.numbers.length > 1;
        }
      }, {
        key: "getPluralFormsOfKey",
        value: function getPluralFormsOfKey(code, key) {
          var options = arguments.length > 2 && arguments[2] !== void 0 ? arguments[2] : {};
          return this.getSuffixes(code, options).map(function(suffix) {
            return "".concat(key).concat(suffix);
          });
        }
      }, {
        key: "getSuffixes",
        value: function getSuffixes(code) {
          var _this = this;
          var options = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : {};
          var rule = this.getRule(code, options);
          if (!rule) {
            return [];
          }
          if (this.shouldUseIntlApi()) {
            return rule.resolvedOptions().pluralCategories.sort(function(pluralCategory1, pluralCategory2) {
              return suffixesOrder[pluralCategory1] - suffixesOrder[pluralCategory2];
            }).map(function(pluralCategory) {
              return "".concat(_this.options.prepend).concat(pluralCategory);
            });
          }
          return rule.numbers.map(function(number) {
            return _this.getSuffix(code, number, options);
          });
        }
      }, {
        key: "getSuffix",
        value: function getSuffix(code, count) {
          var options = arguments.length > 2 && arguments[2] !== void 0 ? arguments[2] : {};
          var rule = this.getRule(code, options);
          if (rule) {
            if (this.shouldUseIntlApi()) {
              return "".concat(this.options.prepend).concat(rule.select(count));
            }
            return this.getSuffixRetroCompatible(rule, count);
          }
          this.logger.warn("no plural rule found for: ".concat(code));
          return "";
        }
      }, {
        key: "getSuffixRetroCompatible",
        value: function getSuffixRetroCompatible(rule, count) {
          var _this2 = this;
          var idx = rule.noAbs ? rule.plurals(count) : rule.plurals(Math.abs(count));
          var suffix = rule.numbers[idx];
          if (this.options.simplifyPluralSuffix && rule.numbers.length === 2 && rule.numbers[0] === 1) {
            if (suffix === 2) {
              suffix = "plural";
            } else if (suffix === 1) {
              suffix = "";
            }
          }
          var returnSuffix = function returnSuffix2() {
            return _this2.options.prepend && suffix.toString() ? _this2.options.prepend + suffix.toString() : suffix.toString();
          };
          if (this.options.compatibilityJSON === "v1") {
            if (suffix === 1)
              return "";
            if (typeof suffix === "number")
              return "_plural_".concat(suffix.toString());
            return returnSuffix();
          } else if (this.options.compatibilityJSON === "v2") {
            return returnSuffix();
          } else if (this.options.simplifyPluralSuffix && rule.numbers.length === 2 && rule.numbers[0] === 1) {
            return returnSuffix();
          }
          return this.options.prepend && idx.toString() ? this.options.prepend + idx.toString() : idx.toString();
        }
      }, {
        key: "shouldUseIntlApi",
        value: function shouldUseIntlApi() {
          return !deprecatedJsonVersions.includes(this.options.compatibilityJSON);
        }
      }]);
      return PluralResolver2;
    }();
    Interpolator = function() {
      function Interpolator2() {
        var options = arguments.length > 0 && arguments[0] !== void 0 ? arguments[0] : {};
        _classCallCheck(this, Interpolator2);
        this.logger = baseLogger.create("interpolator");
        this.options = options;
        this.format = options.interpolation && options.interpolation.format || function(value) {
          return value;
        };
        this.init(options);
      }
      _createClass(Interpolator2, [{
        key: "init",
        value: function init2() {
          var options = arguments.length > 0 && arguments[0] !== void 0 ? arguments[0] : {};
          if (!options.interpolation)
            options.interpolation = {
              escapeValue: true
            };
          var iOpts = options.interpolation;
          this.escape = iOpts.escape !== void 0 ? iOpts.escape : escape;
          this.escapeValue = iOpts.escapeValue !== void 0 ? iOpts.escapeValue : true;
          this.useRawValueToEscape = iOpts.useRawValueToEscape !== void 0 ? iOpts.useRawValueToEscape : false;
          this.prefix = iOpts.prefix ? regexEscape(iOpts.prefix) : iOpts.prefixEscaped || "{{";
          this.suffix = iOpts.suffix ? regexEscape(iOpts.suffix) : iOpts.suffixEscaped || "}}";
          this.formatSeparator = iOpts.formatSeparator ? iOpts.formatSeparator : iOpts.formatSeparator || ",";
          this.unescapePrefix = iOpts.unescapeSuffix ? "" : iOpts.unescapePrefix || "-";
          this.unescapeSuffix = this.unescapePrefix ? "" : iOpts.unescapeSuffix || "";
          this.nestingPrefix = iOpts.nestingPrefix ? regexEscape(iOpts.nestingPrefix) : iOpts.nestingPrefixEscaped || regexEscape("$t(");
          this.nestingSuffix = iOpts.nestingSuffix ? regexEscape(iOpts.nestingSuffix) : iOpts.nestingSuffixEscaped || regexEscape(")");
          this.nestingOptionsSeparator = iOpts.nestingOptionsSeparator ? iOpts.nestingOptionsSeparator : iOpts.nestingOptionsSeparator || ",";
          this.maxReplaces = iOpts.maxReplaces ? iOpts.maxReplaces : 1e3;
          this.alwaysFormat = iOpts.alwaysFormat !== void 0 ? iOpts.alwaysFormat : false;
          this.resetRegExp();
        }
      }, {
        key: "reset",
        value: function reset() {
          if (this.options)
            this.init(this.options);
        }
      }, {
        key: "resetRegExp",
        value: function resetRegExp() {
          var regexpStr = "".concat(this.prefix, "(.+?)").concat(this.suffix);
          this.regexp = new RegExp(regexpStr, "g");
          var regexpUnescapeStr = "".concat(this.prefix).concat(this.unescapePrefix, "(.+?)").concat(this.unescapeSuffix).concat(this.suffix);
          this.regexpUnescape = new RegExp(regexpUnescapeStr, "g");
          var nestingRegexpStr = "".concat(this.nestingPrefix, "(.+?)").concat(this.nestingSuffix);
          this.nestingRegexp = new RegExp(nestingRegexpStr, "g");
        }
      }, {
        key: "interpolate",
        value: function interpolate(str, data, lng, options) {
          var _this = this;
          var match;
          var value;
          var replaces;
          var defaultData = this.options && this.options.interpolation && this.options.interpolation.defaultVariables || {};
          function regexSafe(val) {
            return val.replace(/\$/g, "$$$$");
          }
          var handleFormat = function handleFormat2(key) {
            if (key.indexOf(_this.formatSeparator) < 0) {
              var path = deepFindWithDefaults(data, defaultData, key, _this.options.keySeparator, _this.options.ignoreJSONStructure);
              return _this.alwaysFormat ? _this.format(path, void 0, lng, _objectSpread$3(_objectSpread$3(_objectSpread$3({}, options), data), {}, {
                interpolationkey: key
              })) : path;
            }
            var p = key.split(_this.formatSeparator);
            var k = p.shift().trim();
            var f = p.join(_this.formatSeparator).trim();
            return _this.format(deepFindWithDefaults(data, defaultData, k, _this.options.keySeparator, _this.options.ignoreJSONStructure), f, lng, _objectSpread$3(_objectSpread$3(_objectSpread$3({}, options), data), {}, {
              interpolationkey: k
            }));
          };
          this.resetRegExp();
          var missingInterpolationHandler = options && options.missingInterpolationHandler || this.options.missingInterpolationHandler;
          var skipOnVariables = options && options.interpolation && options.interpolation.skipOnVariables !== void 0 ? options.interpolation.skipOnVariables : this.options.interpolation.skipOnVariables;
          var todos = [{
            regex: this.regexpUnescape,
            safeValue: function safeValue(val) {
              return regexSafe(val);
            }
          }, {
            regex: this.regexp,
            safeValue: function safeValue(val) {
              return _this.escapeValue ? regexSafe(_this.escape(val)) : regexSafe(val);
            }
          }];
          todos.forEach(function(todo) {
            replaces = 0;
            while (match = todo.regex.exec(str)) {
              var matchedVar = match[1].trim();
              value = handleFormat(matchedVar);
              if (value === void 0) {
                if (typeof missingInterpolationHandler === "function") {
                  var temp = missingInterpolationHandler(str, match, options);
                  value = typeof temp === "string" ? temp : "";
                } else if (options && Object.prototype.hasOwnProperty.call(options, matchedVar)) {
                  value = "";
                } else if (skipOnVariables) {
                  value = match[0];
                  continue;
                } else {
                  _this.logger.warn("missed to pass in variable ".concat(matchedVar, " for interpolating ").concat(str));
                  value = "";
                }
              } else if (typeof value !== "string" && !_this.useRawValueToEscape) {
                value = makeString(value);
              }
              var safeValue = todo.safeValue(value);
              str = str.replace(match[0], safeValue);
              if (skipOnVariables) {
                todo.regex.lastIndex += value.length;
                todo.regex.lastIndex -= match[0].length;
              } else {
                todo.regex.lastIndex = 0;
              }
              replaces++;
              if (replaces >= _this.maxReplaces) {
                break;
              }
            }
          });
          return str;
        }
      }, {
        key: "nest",
        value: function nest(str, fc) {
          var _this2 = this;
          var options = arguments.length > 2 && arguments[2] !== void 0 ? arguments[2] : {};
          var match;
          var value;
          var clonedOptions;
          function handleHasOptions(key, inheritedOptions) {
            var sep = this.nestingOptionsSeparator;
            if (key.indexOf(sep) < 0)
              return key;
            var c = key.split(new RegExp("".concat(sep, "[ ]*{")));
            var optionsString = "{".concat(c[1]);
            key = c[0];
            optionsString = this.interpolate(optionsString, clonedOptions);
            var matchedSingleQuotes = optionsString.match(/'/g);
            var matchedDoubleQuotes = optionsString.match(/"/g);
            if (matchedSingleQuotes && matchedSingleQuotes.length % 2 === 0 && !matchedDoubleQuotes || matchedDoubleQuotes.length % 2 !== 0) {
              optionsString = optionsString.replace(/'/g, '"');
            }
            try {
              clonedOptions = JSON.parse(optionsString);
              if (inheritedOptions)
                clonedOptions = _objectSpread$3(_objectSpread$3({}, inheritedOptions), clonedOptions);
            } catch (e) {
              this.logger.warn("failed parsing options string in nesting for key ".concat(key), e);
              return "".concat(key).concat(sep).concat(optionsString);
            }
            delete clonedOptions.defaultValue;
            return key;
          }
          while (match = this.nestingRegexp.exec(str)) {
            var formatters = [];
            clonedOptions = _objectSpread$3({}, options);
            clonedOptions = clonedOptions.replace && typeof clonedOptions.replace !== "string" ? clonedOptions.replace : clonedOptions;
            clonedOptions.applyPostProcessor = false;
            delete clonedOptions.defaultValue;
            var doReduce = false;
            if (match[0].indexOf(this.formatSeparator) !== -1 && !/{.*}/.test(match[1])) {
              var r = match[1].split(this.formatSeparator).map(function(elem) {
                return elem.trim();
              });
              match[1] = r.shift();
              formatters = r;
              doReduce = true;
            }
            value = fc(handleHasOptions.call(this, match[1].trim(), clonedOptions), clonedOptions);
            if (value && match[0] === str && typeof value !== "string")
              return value;
            if (typeof value !== "string")
              value = makeString(value);
            if (!value) {
              this.logger.warn("missed to resolve ".concat(match[1], " for nesting ").concat(str));
              value = "";
            }
            if (doReduce) {
              value = formatters.reduce(function(v, f) {
                return _this2.format(v, f, options.lng, _objectSpread$3(_objectSpread$3({}, options), {}, {
                  interpolationkey: match[1].trim()
                }));
              }, value.trim());
            }
            str = str.replace(match[0], value);
            this.regexp.lastIndex = 0;
          }
          return str;
        }
      }]);
      return Interpolator2;
    }();
    Formatter = function() {
      function Formatter2() {
        var options = arguments.length > 0 && arguments[0] !== void 0 ? arguments[0] : {};
        _classCallCheck(this, Formatter2);
        this.logger = baseLogger.create("formatter");
        this.options = options;
        this.formats = {
          number: createCachedFormatter(function(lng, opt) {
            var formatter = new Intl.NumberFormat(lng, _objectSpread$2({}, opt));
            return function(val) {
              return formatter.format(val);
            };
          }),
          currency: createCachedFormatter(function(lng, opt) {
            var formatter = new Intl.NumberFormat(lng, _objectSpread$2(_objectSpread$2({}, opt), {}, {
              style: "currency"
            }));
            return function(val) {
              return formatter.format(val);
            };
          }),
          datetime: createCachedFormatter(function(lng, opt) {
            var formatter = new Intl.DateTimeFormat(lng, _objectSpread$2({}, opt));
            return function(val) {
              return formatter.format(val);
            };
          }),
          relativetime: createCachedFormatter(function(lng, opt) {
            var formatter = new Intl.RelativeTimeFormat(lng, _objectSpread$2({}, opt));
            return function(val) {
              return formatter.format(val, opt.range || "day");
            };
          }),
          list: createCachedFormatter(function(lng, opt) {
            var formatter = new Intl.ListFormat(lng, _objectSpread$2({}, opt));
            return function(val) {
              return formatter.format(val);
            };
          })
        };
        this.init(options);
      }
      _createClass(Formatter2, [{
        key: "init",
        value: function init2(services) {
          var options = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : {
            interpolation: {}
          };
          var iOpts = options.interpolation;
          this.formatSeparator = iOpts.formatSeparator ? iOpts.formatSeparator : iOpts.formatSeparator || ",";
        }
      }, {
        key: "add",
        value: function add(name, fc) {
          this.formats[name.toLowerCase().trim()] = fc;
        }
      }, {
        key: "addCached",
        value: function addCached(name, fc) {
          this.formats[name.toLowerCase().trim()] = createCachedFormatter(fc);
        }
      }, {
        key: "format",
        value: function format(value, _format, lng) {
          var _this = this;
          var options = arguments.length > 3 && arguments[3] !== void 0 ? arguments[3] : {};
          var formats = _format.split(this.formatSeparator);
          var result = formats.reduce(function(mem, f) {
            var _parseFormatStr = parseFormatStr(f), formatName = _parseFormatStr.formatName, formatOptions = _parseFormatStr.formatOptions;
            if (_this.formats[formatName]) {
              var formatted = mem;
              try {
                var valOptions = options && options.formatParams && options.formatParams[options.interpolationkey] || {};
                var l = valOptions.locale || valOptions.lng || options.locale || options.lng || lng;
                formatted = _this.formats[formatName](mem, l, _objectSpread$2(_objectSpread$2(_objectSpread$2({}, formatOptions), options), valOptions));
              } catch (error2) {
                _this.logger.warn(error2);
              }
              return formatted;
            } else {
              _this.logger.warn("there was no format function for ".concat(formatName));
            }
            return mem;
          }, value);
          return result;
        }
      }]);
      return Formatter2;
    }();
    Connector = function(_EventEmitter) {
      _inherits(Connector2, _EventEmitter);
      var _super = _createSuper$1(Connector2);
      function Connector2(backend, store, services) {
        var _this;
        var options = arguments.length > 3 && arguments[3] !== void 0 ? arguments[3] : {};
        _classCallCheck(this, Connector2);
        _this = _super.call(this);
        if (isIE10) {
          EventEmitter.call(_assertThisInitialized(_this));
        }
        _this.backend = backend;
        _this.store = store;
        _this.services = services;
        _this.languageUtils = services.languageUtils;
        _this.options = options;
        _this.logger = baseLogger.create("backendConnector");
        _this.waitingReads = [];
        _this.maxParallelReads = options.maxParallelReads || 10;
        _this.readingCalls = 0;
        _this.maxRetries = options.maxRetries >= 0 ? options.maxRetries : 5;
        _this.retryTimeout = options.retryTimeout >= 1 ? options.retryTimeout : 350;
        _this.state = {};
        _this.queue = [];
        if (_this.backend && _this.backend.init) {
          _this.backend.init(services, options.backend, options);
        }
        return _this;
      }
      _createClass(Connector2, [{
        key: "queueLoad",
        value: function queueLoad(languages, namespaces, options, callback) {
          var _this2 = this;
          var toLoad = {};
          var pending = {};
          var toLoadLanguages = {};
          var toLoadNamespaces = {};
          languages.forEach(function(lng) {
            var hasAllNamespaces = true;
            namespaces.forEach(function(ns) {
              var name = "".concat(lng, "|").concat(ns);
              if (!options.reload && _this2.store.hasResourceBundle(lng, ns)) {
                _this2.state[name] = 2;
              } else if (_this2.state[name] < 0)
                ;
              else if (_this2.state[name] === 1) {
                if (pending[name] === void 0)
                  pending[name] = true;
              } else {
                _this2.state[name] = 1;
                hasAllNamespaces = false;
                if (pending[name] === void 0)
                  pending[name] = true;
                if (toLoad[name] === void 0)
                  toLoad[name] = true;
                if (toLoadNamespaces[ns] === void 0)
                  toLoadNamespaces[ns] = true;
              }
            });
            if (!hasAllNamespaces)
              toLoadLanguages[lng] = true;
          });
          if (Object.keys(toLoad).length || Object.keys(pending).length) {
            this.queue.push({
              pending,
              pendingCount: Object.keys(pending).length,
              loaded: {},
              errors: [],
              callback
            });
          }
          return {
            toLoad: Object.keys(toLoad),
            pending: Object.keys(pending),
            toLoadLanguages: Object.keys(toLoadLanguages),
            toLoadNamespaces: Object.keys(toLoadNamespaces)
          };
        }
      }, {
        key: "loaded",
        value: function loaded(name, err, data) {
          var s = name.split("|");
          var lng = s[0];
          var ns = s[1];
          if (err)
            this.emit("failedLoading", lng, ns, err);
          if (data) {
            this.store.addResourceBundle(lng, ns, data);
          }
          this.state[name] = err ? -1 : 2;
          var loaded2 = {};
          this.queue.forEach(function(q) {
            pushPath(q.loaded, [lng], ns);
            removePending(q, name);
            if (err)
              q.errors.push(err);
            if (q.pendingCount === 0 && !q.done) {
              Object.keys(q.loaded).forEach(function(l) {
                if (!loaded2[l])
                  loaded2[l] = {};
                var loadedKeys = q.loaded[l];
                if (loadedKeys.length) {
                  loadedKeys.forEach(function(n) {
                    if (loaded2[l][n] === void 0)
                      loaded2[l][n] = true;
                  });
                }
              });
              q.done = true;
              if (q.errors.length) {
                q.callback(q.errors);
              } else {
                q.callback();
              }
            }
          });
          this.emit("loaded", loaded2);
          this.queue = this.queue.filter(function(q) {
            return !q.done;
          });
        }
      }, {
        key: "read",
        value: function read(lng, ns, fcName) {
          var _this3 = this;
          var tried = arguments.length > 3 && arguments[3] !== void 0 ? arguments[3] : 0;
          var wait = arguments.length > 4 && arguments[4] !== void 0 ? arguments[4] : this.retryTimeout;
          var callback = arguments.length > 5 ? arguments[5] : void 0;
          if (!lng.length)
            return callback(null, {});
          if (this.readingCalls >= this.maxParallelReads) {
            this.waitingReads.push({
              lng,
              ns,
              fcName,
              tried,
              wait,
              callback
            });
            return;
          }
          this.readingCalls++;
          var resolver = function resolver2(err, data) {
            _this3.readingCalls--;
            if (_this3.waitingReads.length > 0) {
              var next = _this3.waitingReads.shift();
              _this3.read(next.lng, next.ns, next.fcName, next.tried, next.wait, next.callback);
            }
            if (err && data && tried < _this3.maxRetries) {
              setTimeout(function() {
                _this3.read.call(_this3, lng, ns, fcName, tried + 1, wait * 2, callback);
              }, wait);
              return;
            }
            callback(err, data);
          };
          var fc = this.backend[fcName].bind(this.backend);
          if (fc.length === 2) {
            try {
              var r = fc(lng, ns);
              if (r && typeof r.then === "function") {
                r.then(function(data) {
                  return resolver(null, data);
                })["catch"](resolver);
              } else {
                resolver(null, r);
              }
            } catch (err) {
              resolver(err);
            }
            return;
          }
          return fc(lng, ns, resolver);
        }
      }, {
        key: "prepareLoading",
        value: function prepareLoading(languages, namespaces) {
          var _this4 = this;
          var options = arguments.length > 2 && arguments[2] !== void 0 ? arguments[2] : {};
          var callback = arguments.length > 3 ? arguments[3] : void 0;
          if (!this.backend) {
            this.logger.warn("No backend was added via i18next.use. Will not load resources.");
            return callback && callback();
          }
          if (typeof languages === "string")
            languages = this.languageUtils.toResolveHierarchy(languages);
          if (typeof namespaces === "string")
            namespaces = [namespaces];
          var toLoad = this.queueLoad(languages, namespaces, options, callback);
          if (!toLoad.toLoad.length) {
            if (!toLoad.pending.length)
              callback();
            return null;
          }
          toLoad.toLoad.forEach(function(name) {
            _this4.loadOne(name);
          });
        }
      }, {
        key: "load",
        value: function load(languages, namespaces, callback) {
          this.prepareLoading(languages, namespaces, {}, callback);
        }
      }, {
        key: "reload",
        value: function reload(languages, namespaces, callback) {
          this.prepareLoading(languages, namespaces, {
            reload: true
          }, callback);
        }
      }, {
        key: "loadOne",
        value: function loadOne(name) {
          var _this5 = this;
          var prefix = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : "";
          var s = name.split("|");
          var lng = s[0];
          var ns = s[1];
          this.read(lng, ns, "read", void 0, void 0, function(err, data) {
            if (err)
              _this5.logger.warn("".concat(prefix, "loading namespace ").concat(ns, " for language ").concat(lng, " failed"), err);
            if (!err && data)
              _this5.logger.log("".concat(prefix, "loaded namespace ").concat(ns, " for language ").concat(lng), data);
            _this5.loaded(name, err, data);
          });
        }
      }, {
        key: "saveMissing",
        value: function saveMissing(languages, namespace, key, fallbackValue, isUpdate) {
          var options = arguments.length > 5 && arguments[5] !== void 0 ? arguments[5] : {};
          var clb = arguments.length > 6 && arguments[6] !== void 0 ? arguments[6] : function() {
          };
          if (this.services.utils && this.services.utils.hasLoadedNamespace && !this.services.utils.hasLoadedNamespace(namespace)) {
            this.logger.warn('did not save key "'.concat(key, '" as the namespace "').concat(namespace, '" was not yet loaded'), "This means something IS WRONG in your setup. You access the t function before i18next.init / i18next.loadNamespace / i18next.changeLanguage was done. Wait for the callback or Promise to resolve before accessing it!!!");
            return;
          }
          if (key === void 0 || key === null || key === "")
            return;
          if (this.backend && this.backend.create) {
            var opts = _objectSpread$1(_objectSpread$1({}, options), {}, {
              isUpdate
            });
            var fc = this.backend.create.bind(this.backend);
            if (fc.length < 6) {
              try {
                var r;
                if (fc.length === 5) {
                  r = fc(languages, namespace, key, fallbackValue, opts);
                } else {
                  r = fc(languages, namespace, key, fallbackValue);
                }
                if (r && typeof r.then === "function") {
                  r.then(function(data) {
                    return clb(null, data);
                  })["catch"](clb);
                } else {
                  clb(null, r);
                }
              } catch (err) {
                clb(err);
              }
            } else {
              fc(languages, namespace, key, fallbackValue, clb, opts);
            }
          }
          if (!languages || !languages[0])
            return;
          this.store.addResource(languages[0], namespace, key, fallbackValue);
        }
      }]);
      return Connector2;
    }(EventEmitter);
    I18n = function(_EventEmitter) {
      _inherits(I18n2, _EventEmitter);
      var _super = _createSuper(I18n2);
      function I18n2() {
        var _this;
        var options = arguments.length > 0 && arguments[0] !== void 0 ? arguments[0] : {};
        var callback = arguments.length > 1 ? arguments[1] : void 0;
        _classCallCheck(this, I18n2);
        _this = _super.call(this);
        if (isIE10) {
          EventEmitter.call(_assertThisInitialized(_this));
        }
        _this.options = transformOptions(options);
        _this.services = {};
        _this.logger = baseLogger;
        _this.modules = {
          external: []
        };
        bindMemberFunctions(_assertThisInitialized(_this));
        if (callback && !_this.isInitialized && !options.isClone) {
          if (!_this.options.initImmediate) {
            _this.init(options, callback);
            return _possibleConstructorReturn(_this, _assertThisInitialized(_this));
          }
          setTimeout(function() {
            _this.init(options, callback);
          }, 0);
        }
        return _this;
      }
      _createClass(I18n2, [{
        key: "init",
        value: function init2() {
          var _this2 = this;
          var options = arguments.length > 0 && arguments[0] !== void 0 ? arguments[0] : {};
          var callback = arguments.length > 1 ? arguments[1] : void 0;
          if (typeof options === "function") {
            callback = options;
            options = {};
          }
          if (!options.defaultNS && options.defaultNS !== false && options.ns) {
            if (typeof options.ns === "string") {
              options.defaultNS = options.ns;
            } else if (options.ns.indexOf("translation") < 0) {
              options.defaultNS = options.ns[0];
            }
          }
          var defOpts = get();
          this.options = _objectSpread(_objectSpread(_objectSpread({}, defOpts), this.options), transformOptions(options));
          if (this.options.compatibilityAPI !== "v1") {
            this.options.interpolation = _objectSpread(_objectSpread({}, defOpts.interpolation), this.options.interpolation);
          }
          if (options.keySeparator !== void 0) {
            this.options.userDefinedKeySeparator = options.keySeparator;
          }
          if (options.nsSeparator !== void 0) {
            this.options.userDefinedNsSeparator = options.nsSeparator;
          }
          function createClassOnDemand(ClassOrObject) {
            if (!ClassOrObject)
              return null;
            if (typeof ClassOrObject === "function")
              return new ClassOrObject();
            return ClassOrObject;
          }
          if (!this.options.isClone) {
            if (this.modules.logger) {
              baseLogger.init(createClassOnDemand(this.modules.logger), this.options);
            } else {
              baseLogger.init(null, this.options);
            }
            var formatter;
            if (this.modules.formatter) {
              formatter = this.modules.formatter;
            } else if (typeof Intl !== "undefined") {
              formatter = Formatter;
            }
            var lu = new LanguageUtil(this.options);
            this.store = new ResourceStore(this.options.resources, this.options);
            var s = this.services;
            s.logger = baseLogger;
            s.resourceStore = this.store;
            s.languageUtils = lu;
            s.pluralResolver = new PluralResolver(lu, {
              prepend: this.options.pluralSeparator,
              compatibilityJSON: this.options.compatibilityJSON,
              simplifyPluralSuffix: this.options.simplifyPluralSuffix
            });
            if (formatter && (!this.options.interpolation.format || this.options.interpolation.format === defOpts.interpolation.format)) {
              s.formatter = createClassOnDemand(formatter);
              s.formatter.init(s, this.options);
              this.options.interpolation.format = s.formatter.format.bind(s.formatter);
            }
            s.interpolator = new Interpolator(this.options);
            s.utils = {
              hasLoadedNamespace: this.hasLoadedNamespace.bind(this)
            };
            s.backendConnector = new Connector(createClassOnDemand(this.modules.backend), s.resourceStore, s, this.options);
            s.backendConnector.on("*", function(event) {
              for (var _len = arguments.length, args = new Array(_len > 1 ? _len - 1 : 0), _key = 1; _key < _len; _key++) {
                args[_key - 1] = arguments[_key];
              }
              _this2.emit.apply(_this2, [event].concat(args));
            });
            if (this.modules.languageDetector) {
              s.languageDetector = createClassOnDemand(this.modules.languageDetector);
              if (s.languageDetector.init)
                s.languageDetector.init(s, this.options.detection, this.options);
            }
            if (this.modules.i18nFormat) {
              s.i18nFormat = createClassOnDemand(this.modules.i18nFormat);
              if (s.i18nFormat.init)
                s.i18nFormat.init(this);
            }
            this.translator = new Translator(this.services, this.options);
            this.translator.on("*", function(event) {
              for (var _len2 = arguments.length, args = new Array(_len2 > 1 ? _len2 - 1 : 0), _key2 = 1; _key2 < _len2; _key2++) {
                args[_key2 - 1] = arguments[_key2];
              }
              _this2.emit.apply(_this2, [event].concat(args));
            });
            this.modules.external.forEach(function(m) {
              if (m.init)
                m.init(_this2);
            });
          }
          this.format = this.options.interpolation.format;
          if (!callback)
            callback = noop;
          if (this.options.fallbackLng && !this.services.languageDetector && !this.options.lng) {
            var codes = this.services.languageUtils.getFallbackCodes(this.options.fallbackLng);
            if (codes.length > 0 && codes[0] !== "dev")
              this.options.lng = codes[0];
          }
          if (!this.services.languageDetector && !this.options.lng) {
            this.logger.warn("init: no languageDetector is used and no lng is defined");
          }
          var storeApi = ["getResource", "hasResourceBundle", "getResourceBundle", "getDataByLanguage"];
          storeApi.forEach(function(fcName) {
            _this2[fcName] = function() {
              var _this2$store;
              return (_this2$store = _this2.store)[fcName].apply(_this2$store, arguments);
            };
          });
          var storeApiChained = ["addResource", "addResources", "addResourceBundle", "removeResourceBundle"];
          storeApiChained.forEach(function(fcName) {
            _this2[fcName] = function() {
              var _this2$store2;
              (_this2$store2 = _this2.store)[fcName].apply(_this2$store2, arguments);
              return _this2;
            };
          });
          var deferred = defer();
          var load = function load2() {
            var finish = function finish2(err, t2) {
              if (_this2.isInitialized && !_this2.initializedStoreOnce)
                _this2.logger.warn("init: i18next is already initialized. You should call init just once!");
              _this2.isInitialized = true;
              if (!_this2.options.isClone)
                _this2.logger.log("initialized", _this2.options);
              _this2.emit("initialized", _this2.options);
              deferred.resolve(t2);
              callback(err, t2);
            };
            if (_this2.languages && _this2.options.compatibilityAPI !== "v1" && !_this2.isInitialized)
              return finish(null, _this2.t.bind(_this2));
            _this2.changeLanguage(_this2.options.lng, finish);
          };
          if (this.options.resources || !this.options.initImmediate) {
            load();
          } else {
            setTimeout(load, 0);
          }
          return deferred;
        }
      }, {
        key: "loadResources",
        value: function loadResources2(language) {
          var _this3 = this;
          var callback = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : noop;
          var usedCallback = callback;
          var usedLng = typeof language === "string" ? language : this.language;
          if (typeof language === "function")
            usedCallback = language;
          if (!this.options.resources || this.options.partialBundledLanguages) {
            if (usedLng && usedLng.toLowerCase() === "cimode")
              return usedCallback();
            var toLoad = [];
            var append = function append2(lng) {
              if (!lng)
                return;
              var lngs = _this3.services.languageUtils.toResolveHierarchy(lng);
              lngs.forEach(function(l) {
                if (toLoad.indexOf(l) < 0)
                  toLoad.push(l);
              });
            };
            if (!usedLng) {
              var fallbacks = this.services.languageUtils.getFallbackCodes(this.options.fallbackLng);
              fallbacks.forEach(function(l) {
                return append(l);
              });
            } else {
              append(usedLng);
            }
            if (this.options.preload) {
              this.options.preload.forEach(function(l) {
                return append(l);
              });
            }
            this.services.backendConnector.load(toLoad, this.options.ns, function(e) {
              if (!e && !_this3.resolvedLanguage && _this3.language)
                _this3.setResolvedLanguage(_this3.language);
              usedCallback(e);
            });
          } else {
            usedCallback(null);
          }
        }
      }, {
        key: "reloadResources",
        value: function reloadResources2(lngs, ns, callback) {
          var deferred = defer();
          if (!lngs)
            lngs = this.languages;
          if (!ns)
            ns = this.options.ns;
          if (!callback)
            callback = noop;
          this.services.backendConnector.reload(lngs, ns, function(err) {
            deferred.resolve();
            callback(err);
          });
          return deferred;
        }
      }, {
        key: "use",
        value: function use2(module) {
          if (!module)
            throw new Error("You are passing an undefined module! Please check the object you are passing to i18next.use()");
          if (!module.type)
            throw new Error("You are passing a wrong module! Please check the object you are passing to i18next.use()");
          if (module.type === "backend") {
            this.modules.backend = module;
          }
          if (module.type === "logger" || module.log && module.warn && module.error) {
            this.modules.logger = module;
          }
          if (module.type === "languageDetector") {
            this.modules.languageDetector = module;
          }
          if (module.type === "i18nFormat") {
            this.modules.i18nFormat = module;
          }
          if (module.type === "postProcessor") {
            postProcessor.addPostProcessor(module);
          }
          if (module.type === "formatter") {
            this.modules.formatter = module;
          }
          if (module.type === "3rdParty") {
            this.modules.external.push(module);
          }
          return this;
        }
      }, {
        key: "setResolvedLanguage",
        value: function setResolvedLanguage(l) {
          if (!l || !this.languages)
            return;
          if (["cimode", "dev"].indexOf(l) > -1)
            return;
          for (var li = 0; li < this.languages.length; li++) {
            var lngInLngs = this.languages[li];
            if (["cimode", "dev"].indexOf(lngInLngs) > -1)
              continue;
            if (this.store.hasLanguageSomeTranslations(lngInLngs)) {
              this.resolvedLanguage = lngInLngs;
              break;
            }
          }
        }
      }, {
        key: "changeLanguage",
        value: function changeLanguage2(lng, callback) {
          var _this4 = this;
          this.isLanguageChangingTo = lng;
          var deferred = defer();
          this.emit("languageChanging", lng);
          var setLngProps = function setLngProps2(l) {
            _this4.language = l;
            _this4.languages = _this4.services.languageUtils.toResolveHierarchy(l);
            _this4.resolvedLanguage = void 0;
            _this4.setResolvedLanguage(l);
          };
          var done = function done2(err, l) {
            if (l) {
              setLngProps(l);
              _this4.translator.changeLanguage(l);
              _this4.isLanguageChangingTo = void 0;
              _this4.emit("languageChanged", l);
              _this4.logger.log("languageChanged", l);
            } else {
              _this4.isLanguageChangingTo = void 0;
            }
            deferred.resolve(function() {
              return _this4.t.apply(_this4, arguments);
            });
            if (callback)
              callback(err, function() {
                return _this4.t.apply(_this4, arguments);
              });
          };
          var setLng = function setLng2(lngs) {
            if (!lng && !lngs && _this4.services.languageDetector)
              lngs = [];
            var l = typeof lngs === "string" ? lngs : _this4.services.languageUtils.getBestMatchFromCodes(lngs);
            if (l) {
              if (!_this4.language) {
                setLngProps(l);
              }
              if (!_this4.translator.language)
                _this4.translator.changeLanguage(l);
              if (_this4.services.languageDetector && _this4.services.languageDetector.cacheUserLanguage)
                _this4.services.languageDetector.cacheUserLanguage(l);
            }
            _this4.loadResources(l, function(err) {
              done(err, l);
            });
          };
          if (!lng && this.services.languageDetector && !this.services.languageDetector.async) {
            setLng(this.services.languageDetector.detect());
          } else if (!lng && this.services.languageDetector && this.services.languageDetector.async) {
            if (this.services.languageDetector.detect.length === 0) {
              this.services.languageDetector.detect().then(setLng);
            } else {
              this.services.languageDetector.detect(setLng);
            }
          } else {
            setLng(lng);
          }
          return deferred;
        }
      }, {
        key: "getFixedT",
        value: function getFixedT2(lng, ns, keyPrefix) {
          var _this5 = this;
          var fixedT = function fixedT2(key, opts) {
            var options;
            if (_typeof(opts) !== "object") {
              for (var _len3 = arguments.length, rest = new Array(_len3 > 2 ? _len3 - 2 : 0), _key3 = 2; _key3 < _len3; _key3++) {
                rest[_key3 - 2] = arguments[_key3];
              }
              options = _this5.options.overloadTranslationOptionHandler([key, opts].concat(rest));
            } else {
              options = _objectSpread({}, opts);
            }
            options.lng = options.lng || fixedT2.lng;
            options.lngs = options.lngs || fixedT2.lngs;
            options.ns = options.ns || fixedT2.ns;
            options.keyPrefix = options.keyPrefix || keyPrefix || fixedT2.keyPrefix;
            var keySeparator = _this5.options.keySeparator || ".";
            var resultKey;
            if (options.keyPrefix && Array.isArray(key)) {
              resultKey = key.map(function(k) {
                return "".concat(options.keyPrefix).concat(keySeparator).concat(k);
              });
            } else {
              resultKey = options.keyPrefix ? "".concat(options.keyPrefix).concat(keySeparator).concat(key) : key;
            }
            return _this5.t(resultKey, options);
          };
          if (typeof lng === "string") {
            fixedT.lng = lng;
          } else {
            fixedT.lngs = lng;
          }
          fixedT.ns = ns;
          fixedT.keyPrefix = keyPrefix;
          return fixedT;
        }
      }, {
        key: "t",
        value: function t2() {
          var _this$translator;
          return this.translator && (_this$translator = this.translator).translate.apply(_this$translator, arguments);
        }
      }, {
        key: "exists",
        value: function exists2() {
          var _this$translator2;
          return this.translator && (_this$translator2 = this.translator).exists.apply(_this$translator2, arguments);
        }
      }, {
        key: "setDefaultNamespace",
        value: function setDefaultNamespace2(ns) {
          this.options.defaultNS = ns;
        }
      }, {
        key: "hasLoadedNamespace",
        value: function hasLoadedNamespace2(ns) {
          var _this6 = this;
          var options = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : {};
          if (!this.isInitialized) {
            this.logger.warn("hasLoadedNamespace: i18next was not initialized", this.languages);
            return false;
          }
          if (!this.languages || !this.languages.length) {
            this.logger.warn("hasLoadedNamespace: i18n.languages were undefined or empty", this.languages);
            return false;
          }
          var lng = this.resolvedLanguage || this.languages[0];
          var fallbackLng = this.options ? this.options.fallbackLng : false;
          var lastLng = this.languages[this.languages.length - 1];
          if (lng.toLowerCase() === "cimode")
            return true;
          var loadNotPending = function loadNotPending2(l, n) {
            var loadState = _this6.services.backendConnector.state["".concat(l, "|").concat(n)];
            return loadState === -1 || loadState === 2;
          };
          if (options.precheck) {
            var preResult = options.precheck(this, loadNotPending);
            if (preResult !== void 0)
              return preResult;
          }
          if (this.hasResourceBundle(lng, ns))
            return true;
          if (!this.services.backendConnector.backend || this.options.resources && !this.options.partialBundledLanguages)
            return true;
          if (loadNotPending(lng, ns) && (!fallbackLng || loadNotPending(lastLng, ns)))
            return true;
          return false;
        }
      }, {
        key: "loadNamespaces",
        value: function loadNamespaces2(ns, callback) {
          var _this7 = this;
          var deferred = defer();
          if (!this.options.ns) {
            if (callback)
              callback();
            return Promise.resolve();
          }
          if (typeof ns === "string")
            ns = [ns];
          ns.forEach(function(n) {
            if (_this7.options.ns.indexOf(n) < 0)
              _this7.options.ns.push(n);
          });
          this.loadResources(function(err) {
            deferred.resolve();
            if (callback)
              callback(err);
          });
          return deferred;
        }
      }, {
        key: "loadLanguages",
        value: function loadLanguages2(lngs, callback) {
          var deferred = defer();
          if (typeof lngs === "string")
            lngs = [lngs];
          var preloaded = this.options.preload || [];
          var newLngs = lngs.filter(function(lng) {
            return preloaded.indexOf(lng) < 0;
          });
          if (!newLngs.length) {
            if (callback)
              callback();
            return Promise.resolve();
          }
          this.options.preload = preloaded.concat(newLngs);
          this.loadResources(function(err) {
            deferred.resolve();
            if (callback)
              callback(err);
          });
          return deferred;
        }
      }, {
        key: "dir",
        value: function dir2(lng) {
          if (!lng)
            lng = this.resolvedLanguage || (this.languages && this.languages.length > 0 ? this.languages[0] : this.language);
          if (!lng)
            return "rtl";
          var rtlLngs = ["ar", "shu", "sqr", "ssh", "xaa", "yhd", "yud", "aao", "abh", "abv", "acm", "acq", "acw", "acx", "acy", "adf", "ads", "aeb", "aec", "afb", "ajp", "apc", "apd", "arb", "arq", "ars", "ary", "arz", "auz", "avl", "ayh", "ayl", "ayn", "ayp", "bbz", "pga", "he", "iw", "ps", "pbt", "pbu", "pst", "prp", "prd", "ug", "ur", "ydd", "yds", "yih", "ji", "yi", "hbo", "men", "xmn", "fa", "jpr", "peo", "pes", "prs", "dv", "sam", "ckb"];
          var languageUtils = this.services && this.services.languageUtils || new LanguageUtil(get());
          return rtlLngs.indexOf(languageUtils.getLanguagePartFromCode(lng)) > -1 || lng.toLowerCase().indexOf("-arab") > 1 ? "rtl" : "ltr";
        }
      }, {
        key: "cloneInstance",
        value: function cloneInstance() {
          var _this8 = this;
          var options = arguments.length > 0 && arguments[0] !== void 0 ? arguments[0] : {};
          var callback = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : noop;
          var mergedOptions = _objectSpread(_objectSpread(_objectSpread({}, this.options), options), {
            isClone: true
          });
          var clone = new I18n2(mergedOptions);
          if (options.debug !== void 0 || options.prefix !== void 0) {
            clone.logger = clone.logger.clone(options);
          }
          var membersToCopy = ["store", "services", "language"];
          membersToCopy.forEach(function(m) {
            clone[m] = _this8[m];
          });
          clone.services = _objectSpread({}, this.services);
          clone.services.utils = {
            hasLoadedNamespace: clone.hasLoadedNamespace.bind(clone)
          };
          clone.translator = new Translator(clone.services, clone.options);
          clone.translator.on("*", function(event) {
            for (var _len4 = arguments.length, args = new Array(_len4 > 1 ? _len4 - 1 : 0), _key4 = 1; _key4 < _len4; _key4++) {
              args[_key4 - 1] = arguments[_key4];
            }
            clone.emit.apply(clone, [event].concat(args));
          });
          clone.init(mergedOptions, callback);
          clone.translator.options = clone.options;
          clone.translator.backendConnector.services.utils = {
            hasLoadedNamespace: clone.hasLoadedNamespace.bind(clone)
          };
          return clone;
        }
      }, {
        key: "toJSON",
        value: function toJSON() {
          return {
            options: this.options,
            store: this.store,
            language: this.language,
            languages: this.languages,
            resolvedLanguage: this.resolvedLanguage
          };
        }
      }]);
      return I18n2;
    }(EventEmitter);
    _defineProperty(I18n, "createInstance", function() {
      var options = arguments.length > 0 && arguments[0] !== void 0 ? arguments[0] : {};
      var callback = arguments.length > 1 ? arguments[1] : void 0;
      return new I18n(options, callback);
    });
    instance = I18n.createInstance();
    instance.createInstance = I18n.createInstance;
    createInstance = instance.createInstance;
    dir = instance.dir;
    init = instance.init;
    loadResources = instance.loadResources;
    reloadResources = instance.reloadResources;
    use = instance.use;
    changeLanguage = instance.changeLanguage;
    getFixedT = instance.getFixedT;
    t = instance.t;
    exists = instance.exists;
    setDefaultNamespace = instance.setDefaultNamespace;
    hasLoadedNamespace = instance.hasLoadedNamespace;
    loadNamespaces = instance.loadNamespaces;
    loadLanguages = instance.loadLanguages;
  }
});

// locales/en/apback.json
var apback_default;
var init_apback = __esm({
  "locales/en/apback.json"() {
    apback_default = {
      ChallengeBody: "{{challenger}} has challenged you to a game of {{- metaGame}}. Please visit https://play.abstractplay.com/ for more details.",
      ChallengeBodyComment: '{{challenger}} has challenged you to a game of {{- metaGame}} with note: "{{- comment}}" Please visit https://play.abstractplay.com/ for more details.',
      ChallengeRejectedBody: "{{quitter}} has declined the {{- metaGame}} challenge. The challenge has been removed.",
      ChallengeRejectedSubject: "AbstractPlay: Challenge rejected",
      ChallengeResponseComment: 'Your opponent commented: "{{- comment}}"',
      ChallengeRevokedBody: "{{name}} has revoked his {{- metaGame}} challenge.",
      ChallengeRevokedBodyComment: '{{name}} has revoked his {{- metaGame}} challenge and commented: "{{- comment}}"',
      ChallengeRevokedSubject: "AbstractPlay: challenge revoked",
      ChallengeSubject: "AbstractPlay: new challenge",
      DearPlayer: "Dear {{player}}",
      EmailOut: "The AbstractPlay system.",
      GameLink: "You can view the game at https://play.abstractplay.com/move/{{metaGame}}/0/{{gameId}}.",
      GameOverBody: "Your {{- metaGame}} game has ended.",
      GameOverLink: "For more details, including a game record you can archive, please visit https://play.abstractplay.com/move/{{metaGame}}/1/{{gameID}}.",
      GameOverResult_win: "You won!",
      GameOverResult_lose: "You lost.",
      GameOverResult_draw: "It was a draw.",
      GameOverScores: "Final scores were as follows: {{scores}}.",
      GameOverSubject: "AbstractPlay: game over",
      GameStartedBody: "The {{- metaGame}} challenge was accepted by all players and the game has started.",
      GameStartedSubject: "AbstractPlay: game started",
      PUSH: {
        titles: {
          challenged: "Challenged",
          declined: "Challenge declined",
          ended: "Game over",
          revoked: "Challenge revoked",
          started: "Game started",
          yourturn: "Your turn",
          tournament: "Tournament started",
          tournamentOver: "Tournament ended"
        }
      },
      YourMove: "It is your turn to move.",
      YourMoveBatchedBody_one: "It's your turn in {{ count }} game. Visit https://play.abstractplay.com to take your turns.",
      YourMoveBatchedBody_other: "It's your turn in {{ count }} games. Visit https://play.abstractplay.com to take your turns.",
      YourMoveBatchedBodyUrgent_one: "It's your turn in {{ count }} game. At least one game has less than 24 hours left on the clock. Visit https://play.abstractplay.com to take your turns.",
      YourMoveBatchedBodyUrgent_other: "It's your turn in {{ count }} games. At least one game has less than 24 hours left on the clock. Visit https://play.abstractplay.com to take your turns.",
      YourMoveBody: "It is now your move in a game of {{- metaGame}}. Please visit https://play.abstractplay.com/ for more details.",
      YourMoveSubject: "AbstractPlay: your move",
      YourMoveSubjectUrgent: "AbstractPlay: your move (urgent)",
      TournamentStartBody: "Tournament {{number}} of the {{- metaGame}} series has started. See https://play.abstractplay.com/tournaments. You are also registered for the next tournament in the series. It will start one week after this tournament ends.",
      TournamentStartBodyVariants: "Tournament {{number}} of the {{- metaGame}}, variants: {{variants}} series has started. See https://play.abstractplay.com/tournaments. You are also registered for the next tournament in the series. It will start one week after this tournament ends.",
      TournamentStartSubject: "Your {{- metaGame}} tournament has started",
      TournamentCancelBody: "Not enough players signed up for Tournament {{number}} of the {{- metaGame}} series and the tournament had to be cancelled.",
      TournamentCancelBodyVariants: "Not enough players signed up for Tournament {{number}} of the {{- metaGame}}, variants: {{variants}} series and the tournament had to be cancelled.",
      TournamentCancelSubject: "Your {{- metaGame}} tournament was cancelled",
      TournamentEndBody: "Tournament {{number}} of the {{- metaGame}} series has ended. See https://play.abstractplay.com/tournament/{{tournamentId}}. The next tournament in the series will start in one week.",
      TournamentEndBodyVariants: "Tournament {{number}} of the {{- metaGame}}, variants: {{variants}} series has ended. See https://play.abstractplay.com/tournament/{{tournamentId}}. The next tournament in the series will start in one week.",
      TournamentEndSubject: "Your {{- metaGame}} tournament has ended",
      TournamentRemoveBody: "You were removed from the {{- metaGame}} tournament you were signed up for, because it is unclear whether you are still interested. If you would still like to participate, please sign up again at https://play.abstractplay.com/tournaments.",
      TournamentRemoveBodyVariants: "You were removed from the {{- metaGame}}, variants: {{variants}} tournament you were signed up for, because it is unclear whether you are still interested. If you would still like to participate, please sign up again at https://play.abstractplay.com/tournaments.",
      TournamentRemoveSubject: "You were removed from a tournament"
    };
  }
});

// locales/fr/apback.json
var apback_default2;
var init_apback2 = __esm({
  "locales/fr/apback.json"() {
    apback_default2 = {
      ChallengeBody: "{{challenger}} vous a d\xE9fi\xE9 au jeu {{- metaGame}}. Allez sur https://play.abstractplay.com/ pour plus de d\xE9tails.",
      ChallengeBodyComment: '{{challenger}} vous d\xE9fie sur le jeu {{- metaGame}} avec le commentaire : "{{- comment}}" Veuillez visiter https://play.abstractplay.com/ pour plus de d\xE9tails.',
      ChallengeRejectedBody: "{{quitter}} a d\xE9clin\xE9 votre d\xE9fi au jeu {{- metaGame}}. Le d\xE9fi a \xE9t\xE9 supprim\xE9.",
      ChallengeRejectedSubject: "AbstractPlay : d\xE9fi rejet\xE9",
      ChallengeResponseComment: 'Votre adversaire a comment\xE9: "{{- comment}}"',
      ChallengeRevokedBody: "{{name}} a annul\xE9 son d\xE9fi sur {{- metaGame}}.",
      ChallengeRevokedBodyComment: '{{name}} a annul\xE9 son d\xE9fi sur {{- metaGame}} et a comment\xE9 : "{{- comment}}"',
      ChallengeRevokedSubject: "AbstractPlay : d\xE9fi annul\xE9",
      ChallengeSubject: "AbstractPlay : nouveau d\xE9fi",
      DearPlayer: "Ch\xE8r(e) {{player}}",
      EmailOut: "Le syst\xE8me AbstractPlay.",
      GameLink: "Vous pouvez voir la partie sur https://play.abstractplay.com/move/{{metaGame}}/0/{{gameId}}.",
      GameOverBody: "Votre partie de {{- metaGame}} est termin\xE9e.",
      GameOverLink: "Pour plus de d\xE9tails ou pour r\xE9cup\xE9rer un enregistrement de la partie, merci de visiter https://play.abstractplay.com/move/{{metaGame}}/1/{{gameID}}.",
      GameOverRating: "Votre nouveau classement est {{rating}}.",
      GameOverResult_win: "Vous avez gagn\xE9 !",
      GameOverResult_lose: "Vous avez perdu.",
      GameOverResult_draw: "Partie nulle.",
      GameOverScores: "Le score final est de : {{scores}}.",
      GameOverSubject: "AbstractPlay : partie termin\xE9e",
      GameStartedBody: "Le challenge {{- metaGame}} a \xE9t\xE9 acc\xE9pt\xE9 par tous les joueurs et la partie a commenc\xE9.",
      GameStartedSubject: "AbstractPlay : la partie a commenc\xE9",
      PUSH: {
        titles: {
          challenged: "D\xE9fi\xE9",
          declined: "D\xE9fi d\xE9clin\xE9",
          ended: "Partie termin\xE9e",
          revoked: "D\xE9fi annul\xE9",
          started: "Partie commenc\xE9e",
          yourturn: "\xC0 vous de jouer",
          tournament: "Le tournoi a commenc\xE9",
          tournamentOver: "Le tournoi s'est termin\xE9"
        }
      },
      YourMove: "C'est votre tour.",
      YourMoveBatchedBody_one: "C'est \xE0 vous de jouer dans {{ count }} partie. Veuillez visiter https://play.abstractplay.com pour jouer votre tour.",
      YourMoveBatchedBody_other: "C'est \xE0 vous de jouer dans {{ count }} parties. Veuillez visiter https://play.abstractplay.com pour jouer vos tours.",
      YourMoveBatchedBodyUrgent_one: "C'est votre tour dans {{ count }} partie. Au moins 1 partie a moins de 24 heures restant sur l'horloge. Rendez-vous sur https://play.abstractplay.com pour jouer votre tour.",
      YourMoveBatchedBodyUrgent_other: "C'est votre tour dans {{ count }} parties. Au moins 1 partie a moins de 24 heures restant sur l'horloge. Rendez-vous sur https://play.abstractplay.com pour jouer votre tour.",
      YourMoveBody: "C'est votre tour dans une partie de {{- metaGame}}. Allez sur https://play.abstractplay.com/ pour en savoir plus.",
      YourMoveSubject: "AbstractPlay : \xE0 vous de jouer",
      YourMoveSubjectUrgent: "AbstractPlay : \xE0 vous de jouer (urgent)",
      TournamentStartBody: "Le tournoir {{number}} de la s\xE9rie {{- metaGame}} a commenc\xE9. Voir https://play.abstractplay.com/tournaments. Vous vous \xEAtes aussi inscrit pour le prochain tournoi dans les s\xE9ries. Ca commencera une semaine apr\xE8s la fin de ce tournoi.",
      TournamentStartBodyVariants: "La s\xE9rie du tournoi {{number}} de {{- metaGame}}, variantes : {{variants}} a commenc\xE9. Voir https://play.abstractplay.com/tournaments. Vous vous \xEAtes aussi inscrit pour le prochain tournoi de la s\xE9rie. Il commencera une semaine apr\xE8s la fin de ce tournoi.",
      TournamentStartSubject: "Votre tournoi de {{- metaGame}} a commenc\xE9",
      TournamentCancelBody: "Pas assez de joueurs se sont inscrits pour le tournoi {{number}} de la s\xE9rie {{- metaGame}} et le tournoi a d\xFB \xEAtre annul\xE9.",
      TournamentCancelBodyVariants: "Pas assez de joueurs se sont inscrits pour le tournoi {{number}} de la s\xE9rie {{- metaGame}}, variantes : {{variants}} et le tournoi a d\xFB \xEAtre annul\xE9.",
      TournamentCancelSubject: "Votre tournoi de {{- metaGame}} a \xE9t\xE9 annul\xE9",
      TournamentEndBody: "Le tournoi {{number}} de la s\xE9rie {{- metaGame}} a \xE9t\xE9 annul\xE9. Voir https://play.abstractplay.com/tournaments. Le prochain tournoi de cette s\xE9rie va d\xE9marrer dans une semaine.",
      TournamentEndBodyVariants: "Le tournoi {{number}} de la s\xE9rie {{- metaGame}}, variantes : {{variants}} s\xE9rie est termin\xE9. Voir https://play.abstractplay.com/tournament/{{tournamentId}}. Le prochain tournoi de cette s\xE9rie va d\xE9marrer dans une semaine.",
      TournamentEndSubject: "Votre tournoi de {{- metaGame}} est termin\xE9",
      TournamentRemoveBody: "Votre inscription au tournoi de {{- metaGame}} a \xE9t\xE9 annul\xE9e, car ce n'\xE9tait pas clair si vous \xE9tiez toujours interess\xE9. Si vous voulez tout de m\xEAme participer, merci de vous r\xE9-inscrire ici : https://play.abstractplay.com/tournaments.",
      TournamentRemoveBodyVariants: "Votre inscription au tournoi de {{- metaGame}}, variantes : {{variants}} a \xE9t\xE9 annul\xE9e, car ce n'\xE9tait pas clair si vous \xEAtiez toujours interess\xE9. Si vous voulez tout de m\xEAme participer, merci de vous r\xE9-inscrire ici : https://play.abstractplay.com/tournaments.",
      TournamentRemoveSubject: "Vous avez \xE9t\xE9 retir\xE9 d'un tournoi"
    };
  }
});

// locales/de/apback.json
var apback_default3;
var init_apback3 = __esm({
  "locales/de/apback.json"() {
    apback_default3 = {
      ChallengeBody: "{{challenger}} hat dich zu einer Partie {{- metaGame}} herausgefordert. Bitte besuche https://play.abstractplay.com/ f\xFCr weitere Details.",
      ChallengeBodyComment: '{{challenger}} hat dich zu einer Partie {{- metaGame}} herausgefordert mit der Anmerkung: "{{- comment}}". Bitte besuche https://play.abstractplay.com/ f\xFCr weitere Details.',
      ChallengeRejectedBody: "{{quitter}} hat die Herausforderung f\xFCr {{- metaGame}} abgelehnt. Die Herausforderung wurde entfernt.",
      ChallengeRejectedSubject: "AbstractPlay: Herausforderung abgelehnt",
      ChallengeResponseComment: 'Dein Gegner hat kommentiert: "{{- comment}}"',
      ChallengeRevokedBody: "{{name}} hat seine Herausforderung f\xFCr {{- metaGame}} zur\xFCckgezogen.",
      ChallengeRevokedBodyComment: '{{name}} hat seine Herausforderung f\xFCr {{- metaGame}} zur\xFCckgezogen und kommentiert: "{{- comment}}"',
      ChallengeRevokedSubject: "AbstractPlay: Herausforderung zur\xFCckgezogen",
      ChallengeSubject: "AbstractPlay: Neue Herausforderung",
      DearPlayer: "Hallo {{player}}",
      EmailOut: "Das AbstractPlay-System.",
      GameLink: "Du kannst die Partie unter https://play.abstractplay.com/move/{{metaGame}}/0/{{gameId}} ansehen.",
      GameOverBody: "Deine Partie {{- metaGame}} ist beendet.",
      GameOverLink: "F\xFCr weitere Details, einschlie\xDFlich eines Partieverlaufs zum Archivieren, besuche bitte https://play.abstractplay.com/move/{{metaGame}}/1/{{gameID}}.",
      GameOverRating: "Deine neue Wertung ist {{rating}}.",
      GameOverResult_win: "Du hast gewonnen!",
      GameOverResult_lose: "Du hast verloren.",
      GameOverResult_draw: "Es war unentschieden.",
      GameOverScores: "Die Endergebnisse lauteten wie folgt: {{scores}}.",
      GameOverSubject: "AbstractPlay: Partie beendet",
      GameStartedBody: "Die Herausforderung f\xFCr {{- metaGame}} wurde von allen Spielern angenommen und die Partie hat begonnen.",
      GameStartedSubject: "AbstractPlay: Partie gestartet",
      PUSH: {
        titles: {
          challenged: "Herausgefordert",
          declined: "Herausforderung abgelehnt",
          ended: "Partie beendet",
          revoked: "Herausforderung zur\xFCckgezogen",
          started: "Partie gestartet",
          yourturn: "Du bist am Zug",
          tournament: "Turnier gestartet",
          tournamentOver: "Turnier beendet"
        }
      },
      YourMove: "Du bist am Zug.",
      YourMoveBatchedBody_one: "Du bist in {{ count }} Partie am Zug. Besuche https://play.abstractplay.com, um deinen Zug zu machen.",
      YourMoveBatchedBody_other: "Du bist in {{ count }} Partien am Zug. Besuche https://play.abstractplay.com, um deine Z\xFCge zu machen.",
      YourMoveBatchedBodyUrgent_one: "Du bist in {{ count }} Partie am Zug. Bei mindestens einer Partie verbleiben weniger als 24 Stunden auf der Uhr. Besuche https://play.abstractplay.com, um deinen Zug zu machen.",
      YourMoveBatchedBodyUrgent_other: "Du bist in {{ count }} Partien am Zug. Bei mindestens einer Partie verbleiben weniger als 24 Stunden auf der Uhr. Besuche https://play.abstractplay.com, um deine Z\xFCge zu machen.",
      YourMoveBody: "Du bist jetzt in einer Partie {{- metaGame}} am Zug. Bitte besuche https://play.abstractplay.com/ f\xFCr weitere Details.",
      YourMoveSubject: "AbstractPlay: Du bist am Zug",
      YourMoveSubjectUrgent: "AbstractPlay: Du bist am Zug (dringend)",
      TournamentStartBody: "Turnier {{number}} der {{- metaGame}}-Serie hat begonnen. Siehe https://play.abstractplay.com/tournaments. Du bist auch f\xFCr das n\xE4chste Turnier dieser Serie registriert. Es beginnt eine Woche nach Ende dieses Turniers.",
      TournamentStartBodyVariants: "Turnier {{number}} der Serie {{- metaGame}} (Varianten: {{variants}}) hat begonnen. Siehe https://play.abstractplay.com/tournaments. Du bist auch f\xFCr das n\xE4chste Turnier dieser Serie registriert. Es beginnt eine Woche nach Ende dieses Turniers.",
      TournamentStartSubject: "Dein {{- metaGame}}-Turnier hat begonnen",
      TournamentCancelBody: "Es haben sich nicht gen\xFCgend Spieler f\xFCr Turnier {{number}} der {{- metaGame}}-Serie angemeldet, daher musste das Turnier abgesagt werden.",
      TournamentCancelBodyVariants: "Es haben sich nicht gen\xFCgend Spieler f\xFCr Turnier {{number}} der Serie {{- metaGame}} (Varianten: {{variants}}) angemeldet, daher musste das Turnier abgesagt werden.",
      TournamentCancelSubject: "Dein {{- metaGame}}-Turnier wurde abgesagt",
      TournamentEndBody: "Turnier {{number}} der {{- metaGame}}-Serie ist beendet. Siehe https://play.abstractplay.com/tournament/{{tournamentId}}. Das n\xE4chste Turnier dieser Serie beginnt in einer Woche.",
      TournamentEndBodyVariants: "Turnier {{number}} der Serie {{- metaGame}} (Varianten: {{variants}}) ist beendet. Siehe https://play.abstractplay.com/tournament/{{tournamentId}}. Das n\xE4chste Turnier dieser Serie beginnt in einer Woche.",
      TournamentEndSubject: "Dein {{- metaGame}}-Turnier ist beendet",
      TournamentRemoveBody: "Du wurdest aus dem {{- metaGame}}-Turnier entfernt, f\xFCr das du angemeldet warst, da unklar ist, ob du noch interessiert bist. Wenn du weiterhin teilnehmen m\xF6chtest, melde dich bitte erneut unter https://play.abstractplay.com/tournaments an.",
      TournamentRemoveBodyVariants: "Du wurdest aus dem {{- metaGame}}-Turnier (Varianten: {{variants}}) entfernt, f\xFCr das du angemeldet warst, da unklar ist, ob du noch interessiert bist. Wenn du weiterhin teilnehmen m\xF6chtest, melde dich bitte erneut unter https://play.abstractplay.com/tournaments an.",
      TournamentRemoveSubject: "Du wurdest aus einem Turnier entfernt"
    };
  }
});

// locales/it/apback.json
var apback_default4;
var init_apback4 = __esm({
  "locales/it/apback.json"() {
    apback_default4 = {
      ChallengeBody: "{{challenger}} ti ha sfidato a una partita a {{- metaGame}}. Visita https://play.abstractplay.com/ per maggiori dettagli.",
      ChallengeBodyComment: '{{challenger}} ti ha sfidato a una partita a {{- metaGame}} con la seguente nota: "{{- comment}}" Visita https://play.abstractplay.com/ per maggiori dettagli.',
      ChallengeRejectedBody: "{{quitter}} ha rifiutato la sfida a {{- metaGame}}. La sfida \xE8 stata rimossa.",
      ChallengeRejectedSubject: "AbstractPlay: Sfida rifiutata",
      ChallengeResponseComment: 'Il tuo avversario ha commentato: "{{- comment}}"',
      ChallengeRevokedBody: "{{name}} ha revocato la sua sfida a {{- metaGame}}.",
      ChallengeRevokedBodyComment: '{{name}} ha revocato la sua sfida a {{- metaGame}} e ha commentato: "{{- comment}}"',
      ChallengeRevokedSubject: "AbstractPlay: sfida revocata",
      ChallengeSubject: "AbstractPlay: nuova sfida",
      DearPlayer: "Caro {{player}}",
      EmailOut: "Il sistema AbstractPlay.",
      GameLink: "Puoi visualizzare la partita su https://play.abstractplay.com/move/{{metaGame}}/0/{{gameId}}.",
      GameOverBody: "La tua partita a {{- metaGame}} \xE8 terminata.",
      GameOverLink: "Per maggiori dettagli, inclusa una trascrizione della partita che puoi archiviare, visita https://play.abstractplay.com/move/{{metaGame}}/1/{{gameID}}.",
      GameOverRating: "Il tuo nuovo rating \xE8 {{rating}}.",
      GameOverResult_win: "Hai vinto!",
      GameOverResult_lose: "Hai perso.",
      GameOverResult_draw: "\xC8 stato un pareggio.",
      GameOverScores: "I punteggi finali sono i seguenti: {{scores}}.",
      GameOverSubject: "AbstractPlay: partita terminata",
      GameStartedBody: "La sfida a {{- metaGame}} \xE8 stata accettata da tutti i giocatori e la partita \xE8 iniziata.",
      GameStartedSubject: "AbstractPlay: partita iniziata",
      PUSH: {
        titles: {
          challenged: "Sfida ricevuta",
          declined: "Sfida rifiutata",
          ended: "Partita terminata",
          revoked: "Sfida revocata",
          started: "Partita iniziata",
          yourturn: "Il tuo turno",
          tournament: "Torneo iniziato",
          tournamentOver: "Torneo terminato"
        }
      },
      YourMove: "\xC8 il tuo turno di muovere.",
      YourMoveBatchedBody_one: "\xC8 il tuo turno in {{ count }} partita. Visita https://play.abstractplay.com per giocare il tuo turno.",
      YourMoveBatchedBody_other: "\xC8 il tuo turno in {{ count }} partite. Visita https://play.abstractplay.com per giocare i tuoi turni.",
      YourMoveBatchedBodyUrgent_one: "\xC8 il tuo turno in {{ count }} partita. Almeno una partita ha meno di 24 ore rimaste sull'orologio. Visita https://play.abstractplay.com per giocare il tuo turno.",
      YourMoveBatchedBodyUrgent_other: "\xC8 il tuo turno in {{ count }} partite. Almeno una partita ha meno di 24 ore rimaste sull'orologio. Visita https://play.abstractplay.com per giocare i tuoi turni.",
      YourMoveBody: "Tocca a te muovere in una partita a {{- metaGame}}. Visita https://play.abstractplay.com/ per maggiori dettagli.",
      YourMoveSubject: "AbstractPlay: tocca a te",
      YourMoveSubjectUrgent: "AbstractPlay: tocca a te (urgente)",
      TournamentStartBody: "Il torneo {{number}} della serie {{- metaGame}} \xE8 iniziato. Vedi https://play.abstractplay.com/tournaments. Sei anche iscritto al prossimo torneo della serie, che inizier\xE0 una settimana dopo la fine di questo torneo.",
      TournamentStartBodyVariants: "Il torneo {{number}} della serie {{- metaGame}}, varianti: {{variants}} \xE8 iniziato. Vedi https://play.abstractplay.com/tournaments. Sei anche iscritto al prossimo torneo della serie, che inizier\xE0 una settimana dopo la fine di questo torneo.",
      TournamentStartSubject: "Il tuo torneo di {{- metaGame}} \xE8 iniziato",
      TournamentCancelBody: "Non si sono iscritti abbastanza giocatori per il torneo {{number}} della serie {{- metaGame}} e il torneo \xE8 stato annullato.",
      TournamentCancelBodyVariants: "Non si sono iscritti abbastanza giocatori per il torneo {{number}} della serie {{- metaGame}}, varianti: {{variants}} e il torneo \xE8 stato annullato.",
      TournamentCancelSubject: "Il tuo torneo di {{- metaGame}} \xE8 stato annullato",
      TournamentEndBody: "Il torneo {{number}} della serie {{- metaGame}} \xE8 terminato. Vedi https://play.abstractplay.com/tournament/{{tournamentId}}. Il prossimo torneo della serie inizier\xE0 tra una settimana.",
      TournamentEndBodyVariants: "Il torneo {{number}} della serie {{- metaGame}}, varianti: {{variants}} \xE8 terminato. Vedi https://play.abstractplay.com/tournament/{{tournamentId}}. Il prossimo torneo della serie inizier\xE0 tra una settimana.",
      TournamentEndSubject: "Il tuo torneo di {{- metaGame}} \xE8 terminato",
      TournamentRemoveBody: "Sei stato rimosso dal torneo di {{- metaGame}} a cui eri iscritto, poich\xE9 non \xE8 chiaro se sei ancora interessato. Se desideri ancora partecipare, iscriviti di nuovo su https://play.abstractplay.com/tournaments.",
      TournamentRemoveBodyVariants: "Sei stato rimosso dal torneo di {{- metaGame}}, varianti: {{variants}} a cui eri iscritto, poich\xE9 non \xE8 chiaro se sei ancora interessato. Se desideri ancora partecipare, iscriviti di nuovo su https://play.abstractplay.com/tournaments.",
      TournamentRemoveSubject: "Sei stato rimosso da un torneo"
    };
  }
});

// locales/es-US/apback.json
var apback_default5;
var init_apback5 = __esm({
  "locales/es-US/apback.json"() {
    apback_default5 = {
      ChallengeBody: "{{challenger}} te ha desafiado a una partida de {{- metaGame}}. Visita https://play.abstractplay.com/ para m\xE1s detalles.",
      ChallengeBodyComment: '{{challenger}} te ha desafiado a una partida de {{- metaGame}} con la nota: "{{- comment}}". Visita https://play.abstractplay.com/ para m\xE1s detalles.',
      ChallengeRejectedBody: "{{quitter}} ha rechazado el desaf\xEDo de {{- metaGame}}. El desaf\xEDo ha sido eliminado.",
      ChallengeRejectedSubject: "AbstractPlay: Desaf\xEDo rechazado",
      ChallengeResponseComment: 'Tu oponente coment\xF3: "{{- comment}}"',
      ChallengeRevokedBody: "{{name}} ha retirado su desaf\xEDo de {{- metaGame}}.",
      ChallengeRevokedBodyComment: '{{name}} ha retirado su desaf\xEDo de {{- metaGame}} y coment\xF3: "{{- comment}}"',
      ChallengeRevokedSubject: "AbstractPlay: desaf\xEDo retirado",
      ChallengeSubject: "AbstractPlay: nuevo desaf\xEDo",
      DearPlayer: "Estimado/a {{player}}",
      EmailOut: "El sistema de AbstractPlay.",
      GameLink: "Puedes ver la partida en https://play.abstractplay.com/move/{{metaGame}}/0/{{gameId}}.",
      GameOverBody: "Tu partida de {{- metaGame}} ha terminado.",
      GameOverLink: "Para ver m\xE1s detalles, incluyendo un registro de la partida que puedes archivar, visita https://play.abstractplay.com/move/{{metaGame}}/1/{{gameID}}.",
      GameOverRating: "Tu nueva clasificaci\xF3n es {{rating}}.",
      GameOverResult_win: "\xA1Ganaste!",
      GameOverResult_lose: "Perdiste.",
      GameOverResult_draw: "Fue un empate.",
      GameOverScores: "Las puntuaciones finales fueron las siguientes: {{scores}}.",
      GameOverSubject: "AbstractPlay: fin de la partida",
      GameStartedBody: "El desaf\xEDo de {{- metaGame}} fue aceptado por todos los jugadores y la partida ha comenzado.",
      GameStartedSubject: "AbstractPlay: partida iniciada",
      PUSH: {
        titles: {
          challenged: "Desafiado",
          declined: "Desaf\xEDo rechazado",
          ended: "Fin de la partida",
          revoked: "Desaf\xEDo retirado",
          started: "Partida iniciada",
          yourturn: "Tu turno",
          tournament: "Torneo iniciado",
          tournamentOver: "Torneo finalizado"
        }
      },
      YourMove: "Es tu turno de mover.",
      YourMoveBatchedBody_one: "Es tu turno en {{ count }} partida. Visita https://play.abstractplay.com para jugar tu turno.",
      YourMoveBatchedBody_other: "Es tu turno en {{ count }} partidas. Visita https://play.abstractplay.com para jugar tus turnos.",
      YourMoveBatchedBodyUrgent_one: "Es tu turno en {{ count }} partida. Quedan menos de 24 horas en el reloj de al menos una partida. Visita https://play.abstractplay.com para jugar tu turno.",
      YourMoveBatchedBodyUrgent_other: "Es tu turno en {{ count }} partidas. Quedan menos de 24 horas en el reloj de al menos una partida. Visita https://play.abstractplay.com para jugar tus turnos.",
      YourMoveBody: "Es tu turno de mover en una partida de {{- metaGame}}. Visita https://play.abstractplay.com/ para m\xE1s detalles.",
      YourMoveSubject: "AbstractPlay: tu turno",
      YourMoveSubjectUrgent: "AbstractPlay: tu turno (urgente)",
      TournamentStartBody: "El torneo {{number}} de la serie {{- metaGame}} ha comenzado. Consulta https://play.abstractplay.com/tournaments. Tambi\xE9n est\xE1s inscrito para el pr\xF3ximo torneo de la serie. Comenzar\xE1 una semana despu\xE9s de que termine este torneo.",
      TournamentStartBodyVariants: "El torneo {{number}} de la serie {{- metaGame}}, variantes: {{variants}} ha comenzado. Consulta https://play.abstractplay.com/tournaments. Tambi\xE9n est\xE1s inscrito para el pr\xF3ximo torneo de la serie. Comenzar\xE1 una semana despu\xE9s de que termine este torneo.",
      TournamentStartSubject: "Tu torneo de {{- metaGame}} ha comenzado",
      TournamentCancelBody: "No se inscribieron suficientes jugadores para el torneo {{number}} de la serie {{- metaGame}} y tuvo que ser cancelado.",
      TournamentCancelBodyVariants: "No se inscribieron suficientes jugadores para el torneo {{number}} de la serie {{- metaGame}}, variantes: {{variants}} y tuvo que ser cancelado.",
      TournamentCancelSubject: "Tu torneo de {{- metaGame}} fue cancelado",
      TournamentEndBody: "El torneo {{number}} de la serie {{- metaGame}} ha finalizado. Consulta https://play.abstractplay.com/tournament/{{tournamentId}}. El pr\xF3ximo torneo de la serie comenzar\xE1 en una semana.",
      TournamentEndBodyVariants: "El torneo {{number}} de la serie {{- metaGame}}, variantes: {{variants}} ha finalizado. Consulta https://play.abstractplay.com/tournament/{{tournamentId}}. El pr\xF3ximo torneo de la serie comenzar\xE1 en una semana.",
      TournamentEndSubject: "Tu torneo de {{- metaGame}} ha finalizado",
      TournamentRemoveBody: "Fuiste eliminado del torneo de {{- metaGame}} en el que estabas inscrito porque no est\xE1 claro si todav\xEDa est\xE1s interesado. Si deseas participar, vuelve a inscribirte en https://play.abstractplay.com/tournaments.",
      TournamentRemoveBodyVariants: "Fuiste eliminado del torneo de {{- metaGame}}, variantes: {{variants}} en el que estabas inscrito porque no est\xE1 claro si todav\xEDa est\xE1s interesado. Si deseas participar, vuelve a inscribirte en https://play.abstractplay.com/tournaments.",
      TournamentRemoveSubject: "Fuiste eliminado de un torneo"
    };
  }
});

// locales/pt/apback.json
var apback_default6;
var init_apback6 = __esm({
  "locales/pt/apback.json"() {
    apback_default6 = {
      ChallengeBody: "{{challenger}} desafiou-o para uma partida de {{- metaGame}}. Visite https://play.abstractplay.com/ para mais pormenores.",
      ChallengeBodyComment: '{{challenger}} desafiou-o para uma partida de {{- metaGame}} com a seguinte observa\xE7\xE3o: "{{- comment}}". Visite https://play.abstractplay.com/ para mais pormenores.',
      ChallengeRejectedBody: "{{quitter}} recusou o desafio {{- metaGame}}. O desafio foi removido.",
      ChallengeRejectedSubject: "AbstractPlay: Desafio rejeitado",
      ChallengeRevokedBody: "{{name}} revogou o seu desafio {{- metaGame}}.",
      ChallengeRevokedBodyComment: '{{name}} revogou o seu desafio {{- metaGame}} e comentou: "{{- comment}}"',
      ChallengeRevokedSubject: "AbstractPlay: desafio revogado",
      ChallengeSubject: "AbstractPlay: um novo desafio",
      DearPlayer: "Caro(a) {{player}}",
      EmailOut: "O sistema AbstractPlay.",
      GameLink: "Pode ver o jogo em https://play.abstractplay.com/move/{{metaGame}}/0/{{gameId}}.",
      GameOverBody: "O seu jogo {{- metaGame}} terminou.",
      GameOverLink: "Para obter mais pormenores, incluindo um registo de jogo que pode arquivar, visite https://play.abstractplay.com/move/{{metaGame}}/1/{{gameID}}.",
      GameOverRating: "A sua nova classifica\xE7\xE3o \xE9 {{rating}}.",
      GameOverResult_win: "Venceu!",
      GameOverResult_lose: "Perdeu.",
      GameOverResult_draw: "Deu empate.",
      GameOverScores: "As pontua\xE7\xF5es finais foram as seguintes: {{scores}}.",
      GameOverSubject: "AbstractPlay: fim de jogo",
      GameStartedBody: "O desafio {{-metaGame}} foi aceito por todos os jogadores e o jogo foi inicializado.",
      GameStartedSubject: "AbstractPlay: o jogo come\xE7ou",
      PUSH: {
        titles: {
          challenged: "Desafiado",
          declined: "Desafio recusado",
          ended: "Fim de jogo",
          revoked: "Desafio revogado",
          started: "O jogo come\xE7ou",
          yourturn: "A sua vez",
          tournament: "O torneio come\xE7ou",
          tournamentOver: "O torneio foi finalizado"
        }
      },
      YourMoveBatchedBody_one: "\xC9 a sua vez no jogo {{count}}. Aceda https://play.abstractplay.com para realizar o seu turno.",
      YourMoveBatchedBody_many: "\xC9 a sua vez nos jogos {{count}}. Aceda https://play.abstractplay.com para realizar o seu turno.",
      YourMoveBatchedBody_other: "\xC9 a sua vez nos jogos {{count}}. Aceda https://play.abstractplay.com para realizar o seu turno.",
      YourMoveBatchedBodyUrgent_one: "\xC9 a sua vez em {{count}} jogo. Tem 24 horas restandos para poder jogar. Acede https://play.abstractplay.com para iniciar a sua partida.",
      YourMoveBatchedBodyUrgent_many: "\xC9 a sua vez em {{count}} jogos. Tem no min\xEDmo um jogo com 24 horas restandos para poder jogar. Aceda https://play.abstractplay.com para iniciar as suas partidas.",
      YourMoveBatchedBodyUrgent_other: "\xC9 a sua vez em {{count}} jogos. Tem no min\xEDmo um jogo com 24 horas restandos para poder jogar. Aceda https://play.abstractplay.com para iniciar a sua partida.",
      YourMoveBody: "\xC9 a sua vez num jogo de {{-metaGame}}. Por favor, aceda https://play.abstractplay.com/ para mais pormenores.",
      YourMoveSubject: "AbstractPlay: a sua vez",
      YourMoveSubjectUrgent: "AbstractPlay: o seu turno (urgente)",
      TournamentStartBody: "O torneio n\xFAmero {{number}} da s\xE9rie {{- metaGame}} come\xE7ou. Verifique em https://play.abstractplay.com/tournaments. Tamb\xE9m est\xE1 registado para o pr\xF3ximo torneio da s\xE9rie. Ele vai come\xE7ar uma semana depois do torneio terminar.",
      TournamentStartBodyVariants: "O torneio n\xFAmero {{number}} de {{- metaGame}}, varia\xE7\xE3o: s\xE9rie {{variants}}, come\xE7ou. Verifique em https://play.abstractplay.com/tournaments. Tamb\xE9m est\xE1 registado para o pr\xF3ximo das s\xE9ries. Ele vai come\xE7ar uma semana depois do torneio terminar.",
      TournamentStartSubject: "O seu torneio {{- metaGame}} come\xE7ou",
      TournamentCancelBody: "N\xE3o h\xE1 jogadores suficientes selecionados para o Torneio n\xFAmero {{number}} da s\xE9rie {{- metaGame}}. O Torneio teve que ser cancelado.",
      TournamentCancelBodyVariants: "N\xE3o h\xE1 jogadores suficientes selecionados para o Torneio n\xFAmero {{number}} de {{- metaGame}}, variantes: as s\xE9ries e torneios {{variants}} tiveram que ser canceladas.",
      TournamentCancelSubject: "O seu torneio {{- metaGame}} foi cancelado",
      TournamentEndBody: "O torneio n\xFAmero {{number}} da s\xE9rie {{- metaGame}} terminou. Veja em https://play.abstractplay.com/tournament/{{tournamentId}}. O pr\xF3ximo torneio da s\xE9rie vai come\xE7ar numa semana.",
      TournamentEndBodyVariants: "O torneio n\xFAmero {{number}} de {{- metaGame}}, variantes: s\xE9ries {{variants}} terminou. Veja em https://play.abstractplay.com/tournament/{{tournamentId}}. O pr\xF3ximo torneio da s\xE9rie vai come\xE7ar numa semana.",
      TournamentEndSubject: "O seu torneio {{- metaGame}} terminou",
      TournamentRemoveBody: "Foi removido do torneio {{- metaGame}} na qual estava inscrito, pois n\xE3o est\xE1 claro se ainda est\xE1 interessado. Se quizer participar, por favor acede novamente em https://play.abstractplay.com/tournaments.",
      TournamentRemoveBodyVariants: "Foi removido de {{- metaGame}}, variantes: torneio {{variants}}, pois n\xE3o est\xE1 claro se ainda est\xE1 interessado. Se quizer participar, por favor acede novamente em https://play.abstractplay.com/tournaments.",
      TournamentRemoveSubject: "Foi removido de um torneio",
      ChallengeResponseComment: 'O seu oponente comentou: "{{- comment}}"',
      YourMove: "\xC9 a sua vez de mover."
    };
  }
});

// locales/ta/apback.json
var apback_default7;
var init_apback7 = __esm({
  "locales/ta/apback.json"() {
    apback_default7 = {
      ChallengeBody: "{{challenger}} {{- metaGame}}\u0B87\u0BA9\u0BCD \u0BB5\u0BBF\u0BB3\u0BC8\u0BAF\u0BBE\u0B9F\u0BCD\u0B9F\u0BC1\u0B95\u0BCD\u0B95\u0BC1 \u0B89\u0B99\u0BCD\u0B95\u0BB3\u0BC8 \u0B85\u0BB1\u0BC8\u0B95\u0BC2\u0BB5\u0BB2\u0BCD \u0B9A\u0BC6\u0BAF\u0BCD\u0BA4\u0BC1\u0BB3\u0BCD\u0BB3\u0BA4\u0BC1. \u0BAE\u0BC7\u0BB2\u0BC1\u0BAE\u0BCD \u0BB5\u0BBF\u0BB5\u0BB0\u0B99\u0BCD\u0B95\u0BB3\u0BC1\u0B95\u0BCD\u0B95\u0BC1 https://play.abstractplay.com/ \u0B90\u0BAA\u0BCD \u0BAA\u0BBE\u0BB0\u0BCD\u0BB5\u0BC8\u0BAF\u0BBF\u0B9F\u0BB5\u0BC1\u0BAE\u0BCD.",
      ChallengeBodyComment: '{{challenger}} \u0B95\u0BC1\u0BB1\u0BBF\u0BAA\u0BCD\u0BAA\u0BC1\u0B9F\u0BA9\u0BCD {{- metaGame}} \u0B87\u0BA9\u0BCD \u0BB5\u0BBF\u0BB3\u0BC8\u0BAF\u0BBE\u0B9F\u0BCD\u0B9F\u0BC1\u0B95\u0BCD\u0B95\u0BC1 \u0B89\u0B99\u0BCD\u0B95\u0BB3\u0BC8 \u0B85\u0BB1\u0BC8\u0B95\u0BC2\u0BB5\u0BB2\u0BCD \u0B9A\u0BC6\u0BAF\u0BCD\u0BA4\u0BC1\u0BB3\u0BCD\u0BB3\u0BBE\u0BB0\u0BCD: "{{- comment}}" \u0BAE\u0BC7\u0BB2\u0BC1\u0BAE\u0BCD \u0BB5\u0BBF\u0BB5\u0BB0\u0B99\u0BCD\u0B95\u0BB3\u0BC1\u0B95\u0BCD\u0B95\u0BC1 https://play.abstractplay.com/ \u0B90\u0BAA\u0BCD \u0BAA\u0BBE\u0BB0\u0BCD\u0BB5\u0BC8\u0BAF\u0BBF\u0B9F\u0BB5\u0BC1\u0BAE\u0BCD.',
      ChallengeRejectedBody: "{{quitter}} {{- metaGame}} \u0B9A\u0BB5\u0BBE\u0BB2\u0BBF\u0BB2\u0BCD \u0B95\u0BC1\u0BB1\u0BC8\u0BA8\u0BCD\u0BA4\u0BC1\u0BB5\u0BBF\u0B9F\u0BCD\u0B9F\u0BA4\u0BC1. \u0B85\u0BB1\u0BC8\u0B95\u0BC2\u0BB5\u0BB2\u0BCD \u0B85\u0B95\u0BB1\u0BCD\u0BB1\u0BAA\u0BCD\u0BAA\u0B9F\u0BCD\u0B9F\u0BC1\u0BB3\u0BCD\u0BB3\u0BA4\u0BC1.",
      ChallengeRejectedSubject: "\u0B9A\u0BC1\u0BB0\u0BC1\u0B95\u0BCD\u0B95\u0BAE\u0BCD: \u0B85\u0BB1\u0BC8\u0B95\u0BC2\u0BB5\u0BB2\u0BCD \u0BA8\u0BBF\u0BB0\u0BBE\u0B95\u0BB0\u0BBF\u0B95\u0BCD\u0B95\u0BAA\u0BCD\u0BAA\u0B9F\u0BCD\u0B9F\u0BA4\u0BC1",
      ChallengeResponseComment: '\u0B89\u0B99\u0BCD\u0B95\u0BB3\u0BCD \u0B8E\u0BA4\u0BBF\u0BB0\u0BCD\u0BAA\u0BCD\u0BAA\u0BBE\u0BB3\u0BB0\u0BCD \u0B95\u0BB0\u0BC1\u0BA4\u0BCD\u0BA4\u0BC1 \u0BA4\u0BC6\u0BB0\u0BBF\u0BB5\u0BBF\u0BA4\u0BCD\u0BA4\u0BBE\u0BB0\u0BCD: "{{- comment}}"',
      ChallengeRevokedBody: "{{name}} \u0B85\u0BB5\u0BB0\u0BA4\u0BC1 {{- metaGame}} \u0B9A\u0BB5\u0BBE\u0BB2\u0BC8 \u0BB0\u0BA4\u0BCD\u0BA4\u0BC1 \u0B9A\u0BC6\u0BAF\u0BCD\u0BA4\u0BC1\u0BB3\u0BCD\u0BB3\u0BA4\u0BC1.",
      ChallengeRevokedBodyComment: '{{name}} \u0B85\u0BB5\u0BB0\u0BA4\u0BC1 {{- metaGame}} \u0B9A\u0BB5\u0BBE\u0BB2\u0BC8 \u0BB0\u0BA4\u0BCD\u0BA4\u0BC1 \u0B9A\u0BC6\u0BAF\u0BCD\u0BA4\u0BC1 \u0B95\u0BB0\u0BC1\u0BA4\u0BCD\u0BA4\u0BC1 \u0BA4\u0BC6\u0BB0\u0BBF\u0BB5\u0BBF\u0BA4\u0BCD\u0BA4\u0BBE\u0BB0\u0BCD: "{{- comment}}"',
      ChallengeRevokedSubject: "\u0B9A\u0BC1\u0BB0\u0BC1\u0B95\u0BCD\u0B95\u0BAE\u0BCD: \u0B85\u0BB1\u0BC8\u0B95\u0BC2\u0BB5\u0BB2\u0BCD \u0BB0\u0BA4\u0BCD\u0BA4\u0BC1 \u0B9A\u0BC6\u0BAF\u0BCD\u0BAF\u0BAA\u0BCD\u0BAA\u0B9F\u0BCD\u0B9F\u0BA4\u0BC1",
      ChallengeSubject: "\u0B9A\u0BC1\u0BB0\u0BC1\u0B95\u0BCD\u0B95\u0BAE\u0BCD: \u0BAA\u0BC1\u0BA4\u0BBF\u0BAF \u0B85\u0BB1\u0BC8\u0B95\u0BC2\u0BB5\u0BB2\u0BCD",
      DearPlayer: "\u0B85\u0BA9\u0BCD\u0BAA\u0BC1\u0BB3\u0BCD\u0BB3 {{player}}",
      EmailOut: "\u0B9A\u0BC1\u0BB0\u0BC1\u0B95\u0BCD\u0B95\u0BAE\u0BCD \u0B85\u0BAE\u0BC8\u0BAA\u0BCD\u0BAA\u0BC1.",
      GameLink: "\u0BA8\u0BC0\u0B99\u0BCD\u0B95\u0BB3\u0BCD \u0BB5\u0BBF\u0BB3\u0BC8\u0BAF\u0BBE\u0B9F\u0BCD\u0B9F\u0BC8 https://play.abstractplay.com/move/{{metaGame}}/0/{{gameId}} \u0B87\u0BB2\u0BCD \u0B95\u0BBE\u0BA3\u0BB2\u0BBE\u0BAE\u0BCD.",
      GameOverBody: "\u0B89\u0B99\u0BCD\u0B95\u0BB3\u0BCD {{- metaGame}}\u0BB5\u0BBF\u0BB3\u0BC8\u0BAF\u0BBE\u0B9F\u0BCD\u0B9F\u0BC1 \u0BAE\u0BC1\u0B9F\u0BBF\u0BA8\u0BCD\u0BA4\u0BA4\u0BC1.",
      GameOverLink: "\u0BA8\u0BC0\u0B99\u0BCD\u0B95\u0BB3\u0BCD \u0B95\u0BBE\u0BAA\u0BCD\u0BAA\u0B95\u0BAA\u0BCD\u0BAA\u0B9F\u0BC1\u0BA4\u0BCD\u0BA4\u0B95\u0BCD\u0B95\u0BC2\u0B9F\u0BBF\u0BAF \u0B92\u0BB0\u0BC1 \u0BB5\u0BBF\u0BB3\u0BC8\u0BAF\u0BBE\u0B9F\u0BCD\u0B9F\u0BC1\u0BAA\u0BCD \u0BAA\u0BA4\u0BBF\u0BB5\u0BC1 \u0B89\u0B9F\u0BCD\u0BAA\u0B9F \u0BAE\u0BC7\u0BB2\u0BC1\u0BAE\u0BCD \u0BB5\u0BBF\u0BB5\u0BB0\u0B99\u0BCD\u0B95\u0BB3\u0BC1\u0B95\u0BCD\u0B95\u0BC1, \u0BA4\u0BAF\u0BB5\u0BC1\u0B9A\u0BC6\u0BAF\u0BCD\u0BA4\u0BC1 https://play.abstractplay.com/move/{{metaGame}}/1/{{gameID}}.",
      GameOverRating: "\u0B89\u0B99\u0BCD\u0B95\u0BB3\u0BCD \u0BAA\u0BC1\u0BA4\u0BBF\u0BAF \u0BAE\u0BA4\u0BBF\u0BAA\u0BCD\u0BAA\u0BC0\u0B9F\u0BC1 {{rating}}.",
      GameOverResult_win: "\u0BA8\u0BC0\u0B99\u0BCD\u0B95\u0BB3\u0BCD \u0BB5\u0BC6\u0BA9\u0BCD\u0BB1\u0BC0\u0BB0\u0BCD\u0B95\u0BB3\u0BCD!",
      GameOverResult_lose: "\u0BA8\u0BC0\u0B99\u0BCD\u0B95\u0BB3\u0BCD \u0B87\u0BB4\u0BA8\u0BCD\u0BA4\u0BC0\u0BB0\u0BCD\u0B95\u0BB3\u0BCD.",
      GameOverResult_draw: "\u0B85\u0BA4\u0BC1 \u0B92\u0BB0\u0BC1 \u0B9A\u0BAE\u0BA8\u0BBF\u0BB2\u0BC8.",
      GameOverScores: "\u0B87\u0BB1\u0BC1\u0BA4\u0BBF \u0BAE\u0BA4\u0BBF\u0BAA\u0BCD\u0BAA\u0BC6\u0BA3\u0BCD\u0B95\u0BB3\u0BCD \u0BAA\u0BBF\u0BA9\u0BCD\u0BB5\u0BB0\u0BC1\u0BAE\u0BBE\u0BB1\u0BC1: {{scores}}.",
      GameOverSubject: "\u0B9A\u0BC1\u0BB0\u0BC1\u0B95\u0BCD\u0B95\u0BAE\u0BCD: \u0BB5\u0BBF\u0BB3\u0BC8\u0BAF\u0BBE\u0B9F\u0BCD\u0B9F\u0BC1 \u0B93\u0BB5\u0BB0\u0BCD",
      GameStartedBody: "{{- metaGame}} \u0B9A\u0BB5\u0BBE\u0BB2\u0BC8 \u0B85\u0BA9\u0BC8\u0BA4\u0BCD\u0BA4\u0BC1 \u0BB5\u0BC0\u0BB0\u0BB0\u0BCD\u0B95\u0BB3\u0BC1\u0BAE\u0BCD \u0B8F\u0BB1\u0BCD\u0BB1\u0BC1\u0B95\u0BCD\u0B95\u0BCA\u0BA3\u0BCD\u0B9F\u0BA9\u0BB0\u0BCD \u0BAE\u0BB1\u0BCD\u0BB1\u0BC1\u0BAE\u0BCD \u0BB5\u0BBF\u0BB3\u0BC8\u0BAF\u0BBE\u0B9F\u0BCD\u0B9F\u0BC1 \u0BA4\u0BCA\u0B9F\u0B99\u0BCD\u0B95\u0BBF\u0BAF\u0BA4\u0BC1.",
      GameStartedSubject: "\u0B9A\u0BC1\u0BB0\u0BC1\u0B95\u0BCD\u0B95\u0BAE\u0BCD: \u0BB5\u0BBF\u0BB3\u0BC8\u0BAF\u0BBE\u0B9F\u0BCD\u0B9F\u0BC1 \u0BA4\u0BCA\u0B9F\u0B99\u0BCD\u0B95\u0BBF\u0BAF\u0BA4\u0BC1",
      PUSH: {
        titles: {
          challenged: "\u0B85\u0BB1\u0BC8\u0B95\u0BC2\u0BB5\u0BB2\u0BCD",
          declined: "\u0B85\u0BB1\u0BC8\u0B95\u0BC2\u0BB5\u0BB2\u0BCD \u0B95\u0BC1\u0BB1\u0BC8\u0BA8\u0BCD\u0BA4\u0BA4\u0BC1",
          ended: "\u0BB5\u0BBF\u0BB3\u0BC8\u0BAF\u0BBE\u0B9F\u0BCD\u0B9F\u0BC1 \u0B93\u0BB5\u0BB0\u0BCD",
          revoked: "\u0B85\u0BB1\u0BC8\u0B95\u0BC2\u0BB5\u0BB2\u0BCD \u0BB0\u0BA4\u0BCD\u0BA4\u0BC1 \u0B9A\u0BC6\u0BAF\u0BCD\u0BAF\u0BAA\u0BCD\u0BAA\u0B9F\u0BCD\u0B9F\u0BA4\u0BC1",
          started: "\u0BB5\u0BBF\u0BB3\u0BC8\u0BAF\u0BBE\u0B9F\u0BCD\u0B9F\u0BC1 \u0BA4\u0BCA\u0B9F\u0B99\u0BCD\u0B95\u0BBF\u0BAF\u0BA4\u0BC1",
          yourturn: "\u0B89\u0B99\u0BCD\u0B95\u0BB3\u0BCD \u0BAE\u0BC1\u0BB1\u0BC8",
          tournament: "\u0BAA\u0BCB\u0B9F\u0BCD\u0B9F\u0BBF \u0BA4\u0BCA\u0B9F\u0B99\u0BCD\u0B95\u0BBF\u0BAF\u0BA4\u0BC1",
          tournamentOver: "\u0BAA\u0BCB\u0B9F\u0BCD\u0B9F\u0BBF \u0BAE\u0BC1\u0B9F\u0BBF\u0BA8\u0BCD\u0BA4\u0BA4\u0BC1"
        }
      },
      YourMove: "\u0BA8\u0B95\u0BB0\u0BCD\u0BB5\u0BA4\u0BC1 \u0B89\u0B99\u0BCD\u0B95\u0BB3\u0BCD \u0BAE\u0BC1\u0BB1\u0BC8.",
      YourMoveBatchedBody_one: "\u0B87\u0BA4\u0BC1 {{ count }} \u0BB5\u0BBF\u0BB3\u0BC8\u0BAF\u0BBE\u0B9F\u0BCD\u0B9F\u0BBF\u0BB2\u0BCD \u0B89\u0B99\u0BCD\u0B95\u0BB3\u0BCD \u0BAE\u0BC1\u0BB1\u0BC8. \u0B89\u0B99\u0BCD\u0B95\u0BB3\u0BCD \u0BA4\u0BBF\u0BB0\u0BC1\u0BAA\u0BCD\u0BAA\u0B99\u0BCD\u0B95\u0BB3\u0BC8 \u0B8E\u0B9F\u0BC1\u0B95\u0BCD\u0B95 https://play.abstractplay.com \u0B90\u0BAA\u0BCD \u0BAA\u0BBE\u0BB0\u0BCD\u0BB5\u0BC8\u0BAF\u0BBF\u0B9F\u0BB5\u0BC1\u0BAE\u0BCD.",
      YourMoveBatchedBody_other: "\u0B87\u0BA4\u0BC1 {{ count }} \u0BB5\u0BBF\u0BB3\u0BC8\u0BAF\u0BBE\u0B9F\u0BCD\u0B9F\u0BC1\u0B95\u0BB3\u0BBF\u0BB2\u0BCD \u0B89\u0B99\u0BCD\u0B95\u0BB3\u0BCD \u0BAE\u0BC1\u0BB1\u0BC8. \u0B89\u0B99\u0BCD\u0B95\u0BB3\u0BCD \u0BA4\u0BBF\u0BB0\u0BC1\u0BAA\u0BCD\u0BAA\u0B99\u0BCD\u0B95\u0BB3\u0BC8 \u0B8E\u0B9F\u0BC1\u0B95\u0BCD\u0B95 https://play.abstractplay.com \u0B90\u0BAA\u0BCD \u0BAA\u0BBE\u0BB0\u0BCD\u0BB5\u0BC8\u0BAF\u0BBF\u0B9F\u0BB5\u0BC1\u0BAE\u0BCD.",
      YourMoveBatchedBodyUrgent_one: "\u0B87\u0BA4\u0BC1 {{ count }} \u0BB5\u0BBF\u0BB3\u0BC8\u0BAF\u0BBE\u0B9F\u0BCD\u0B9F\u0BBF\u0BB2\u0BCD \u0B89\u0B99\u0BCD\u0B95\u0BB3\u0BCD \u0BAE\u0BC1\u0BB1\u0BC8. \u0B95\u0B9F\u0BBF\u0B95\u0BBE\u0BB0\u0BA4\u0BCD\u0BA4\u0BBF\u0BB2\u0BCD \u0B95\u0BC1\u0BB1\u0BC8\u0BA8\u0BCD\u0BA4\u0BA4\u0BC1 \u0B92\u0BB0\u0BC1 \u0BB5\u0BBF\u0BB3\u0BC8\u0BAF\u0BBE\u0B9F\u0BCD\u0B9F\u0BC8\u0BAF\u0BBE\u0BB5\u0BA4\u0BC1 24 \u0BAE\u0BA3\u0BBF \u0BA8\u0BC7\u0BB0\u0BA4\u0BCD\u0BA4\u0BBF\u0BB1\u0BCD\u0B95\u0BC1\u0BAE\u0BCD \u0B95\u0BC1\u0BB1\u0BC8\u0BB5\u0BBE\u0B95\u0BB5\u0BC7 \u0B89\u0BB3\u0BCD\u0BB3\u0BA4\u0BC1. \u0B89\u0B99\u0BCD\u0B95\u0BB3\u0BCD \u0BA4\u0BBF\u0BB0\u0BC1\u0BAA\u0BCD\u0BAA\u0B99\u0BCD\u0B95\u0BB3\u0BC8 \u0B8E\u0B9F\u0BC1\u0B95\u0BCD\u0B95 https://play.abstractplay.com \u0B90\u0BAA\u0BCD \u0BAA\u0BBE\u0BB0\u0BCD\u0BB5\u0BC8\u0BAF\u0BBF\u0B9F\u0BB5\u0BC1\u0BAE\u0BCD.",
      YourMoveBatchedBodyUrgent_other: "\u0B87\u0BA4\u0BC1 {{ count }} \u0BB5\u0BBF\u0BB3\u0BC8\u0BAF\u0BBE\u0B9F\u0BCD\u0B9F\u0BC1\u0B95\u0BB3\u0BBF\u0BB2\u0BCD \u0B89\u0B99\u0BCD\u0B95\u0BB3\u0BCD \u0BAE\u0BC1\u0BB1\u0BC8. \u0B95\u0B9F\u0BBF\u0B95\u0BBE\u0BB0\u0BA4\u0BCD\u0BA4\u0BBF\u0BB2\u0BCD \u0B95\u0BC1\u0BB1\u0BC8\u0BA8\u0BCD\u0BA4\u0BA4\u0BC1 \u0B92\u0BB0\u0BC1 \u0BB5\u0BBF\u0BB3\u0BC8\u0BAF\u0BBE\u0B9F\u0BCD\u0B9F\u0BC8\u0BAF\u0BBE\u0BB5\u0BA4\u0BC1 24 \u0BAE\u0BA3\u0BBF \u0BA8\u0BC7\u0BB0\u0BA4\u0BCD\u0BA4\u0BBF\u0BB1\u0BCD\u0B95\u0BC1\u0BAE\u0BCD \u0B95\u0BC1\u0BB1\u0BC8\u0BB5\u0BBE\u0B95\u0BB5\u0BC7 \u0B89\u0BB3\u0BCD\u0BB3\u0BA4\u0BC1. \u0B89\u0B99\u0BCD\u0B95\u0BB3\u0BCD \u0BA4\u0BBF\u0BB0\u0BC1\u0BAA\u0BCD\u0BAA\u0B99\u0BCD\u0B95\u0BB3\u0BC8 \u0B8E\u0B9F\u0BC1\u0B95\u0BCD\u0B95 https://play.abstractplay.com \u0B90\u0BAA\u0BCD \u0BAA\u0BBE\u0BB0\u0BCD\u0BB5\u0BC8\u0BAF\u0BBF\u0B9F\u0BB5\u0BC1\u0BAE\u0BCD.",
      YourMoveBody: "{{- metaGame}} \u0B87\u0BA9\u0BCD \u0BB5\u0BBF\u0BB3\u0BC8\u0BAF\u0BBE\u0B9F\u0BCD\u0B9F\u0BBF\u0BB2\u0BCD \u0B87\u0BA4\u0BC1 \u0B87\u0BAA\u0BCD\u0BAA\u0BCB\u0BA4\u0BC1 \u0B89\u0B99\u0BCD\u0B95\u0BB3\u0BCD \u0BA8\u0B95\u0BB0\u0BCD\u0BB5\u0BC1. \u0BAE\u0BC7\u0BB2\u0BC1\u0BAE\u0BCD \u0BB5\u0BBF\u0BB5\u0BB0\u0B99\u0BCD\u0B95\u0BB3\u0BC1\u0B95\u0BCD\u0B95\u0BC1 https://play.abstractplay.com/ \u0B90\u0BAA\u0BCD \u0BAA\u0BBE\u0BB0\u0BCD\u0BB5\u0BC8\u0BAF\u0BBF\u0B9F\u0BB5\u0BC1\u0BAE\u0BCD.",
      YourMoveSubject: "\u0B9A\u0BC1\u0BB0\u0BC1\u0B95\u0BCD\u0B95\u0BAE\u0BCD: \u0B89\u0B99\u0BCD\u0B95\u0BB3\u0BCD \u0BA8\u0B9F\u0BB5\u0B9F\u0BBF\u0B95\u0BCD\u0B95\u0BC8",
      YourMoveSubjectUrgent: "\u0B9A\u0BC1\u0BB0\u0BC1\u0B95\u0BCD\u0B95\u0BAE\u0BCD: \u0B89\u0B99\u0BCD\u0B95\u0BB3\u0BCD \u0BA8\u0B9F\u0BB5\u0B9F\u0BBF\u0B95\u0BCD\u0B95\u0BC8 (\u0B85\u0BB5\u0B9A\u0BB0\u0BAE\u0BCD)",
      TournamentStartBody: "{{- metaGame}} \u0BA4\u0BCA\u0B9F\u0BB0\u0BBF\u0BA9\u0BCD \u0BAA\u0BCB\u0B9F\u0BCD\u0B9F\u0BBF {{number}} \u0BA4\u0BCA\u0B9F\u0B99\u0BCD\u0B95\u0BBF\u0BAF\u0BA4\u0BC1. https://play.abstractplay.com/tournaneds \u0B90\u0BAA\u0BCD \u0BAA\u0BBE\u0BB0\u0BCD\u0B95\u0BCD\u0B95\u0BB5\u0BC1\u0BAE\u0BCD. \u0BA4\u0BCA\u0B9F\u0BB0\u0BBF\u0BA9\u0BCD \u0B85\u0B9F\u0BC1\u0BA4\u0BCD\u0BA4 \u0BAA\u0BCB\u0B9F\u0BCD\u0B9F\u0BBF\u0B95\u0BB3\u0BC1\u0B95\u0BCD\u0B95\u0BC1\u0BAE\u0BCD \u0BA8\u0BC0\u0B99\u0BCD\u0B95\u0BB3\u0BCD \u0BAA\u0BA4\u0BBF\u0BB5\u0BC1 \u0B9A\u0BC6\u0BAF\u0BCD\u0BAF\u0BAA\u0BCD\u0BAA\u0B9F\u0BCD\u0B9F\u0BC1\u0BB3\u0BCD\u0BB3\u0BC0\u0BB0\u0BCD\u0B95\u0BB3\u0BCD. \u0B87\u0BA8\u0BCD\u0BA4\u0BAA\u0BCD \u0BAA\u0BCB\u0B9F\u0BCD\u0B9F\u0BBF \u0BAE\u0BC1\u0B9F\u0BBF\u0BA8\u0BCD\u0BA4 \u0B92\u0BB0\u0BC1 \u0BB5\u0BBE\u0BB0\u0BA4\u0BCD\u0BA4\u0BBF\u0BB1\u0BCD\u0B95\u0BC1\u0BAA\u0BCD \u0BAA\u0BBF\u0BB1\u0B95\u0BC1 \u0B87\u0BA4\u0BC1 \u0BA4\u0BCA\u0B9F\u0B99\u0BCD\u0B95\u0BC1\u0BAE\u0BCD.",
      TournamentStartBodyVariants: "{{number}} {{- metaGame}}, \u0BAE\u0BBE\u0BB1\u0BC1\u0BAA\u0BBE\u0B9F\u0BC1\u0B95\u0BB3\u0BCD: {{variants}} \u0BA4\u0BCA\u0B9F\u0BB0\u0BCD \u0BA4\u0BCA\u0B9F\u0B99\u0BCD\u0B95\u0BBF\u0BAF\u0BC1\u0BB3\u0BCD\u0BB3\u0BA4\u0BC1. https://play.abstractplay.com/tournaneds \u0B90\u0BAA\u0BCD \u0BAA\u0BBE\u0BB0\u0BCD\u0B95\u0BCD\u0B95\u0BB5\u0BC1\u0BAE\u0BCD. \u0BA4\u0BCA\u0B9F\u0BB0\u0BBF\u0BA9\u0BCD \u0B85\u0B9F\u0BC1\u0BA4\u0BCD\u0BA4 \u0BAA\u0BCB\u0B9F\u0BCD\u0B9F\u0BBF\u0B95\u0BB3\u0BC1\u0B95\u0BCD\u0B95\u0BC1\u0BAE\u0BCD \u0BA8\u0BC0\u0B99\u0BCD\u0B95\u0BB3\u0BCD \u0BAA\u0BA4\u0BBF\u0BB5\u0BC1 \u0B9A\u0BC6\u0BAF\u0BCD\u0BAF\u0BAA\u0BCD\u0BAA\u0B9F\u0BCD\u0B9F\u0BC1\u0BB3\u0BCD\u0BB3\u0BC0\u0BB0\u0BCD\u0B95\u0BB3\u0BCD. \u0B87\u0BA8\u0BCD\u0BA4\u0BAA\u0BCD \u0BAA\u0BCB\u0B9F\u0BCD\u0B9F\u0BBF \u0BAE\u0BC1\u0B9F\u0BBF\u0BA8\u0BCD\u0BA4 \u0B92\u0BB0\u0BC1 \u0BB5\u0BBE\u0BB0\u0BA4\u0BCD\u0BA4\u0BBF\u0BB1\u0BCD\u0B95\u0BC1\u0BAA\u0BCD \u0BAA\u0BBF\u0BB1\u0B95\u0BC1 \u0B87\u0BA4\u0BC1 \u0BA4\u0BCA\u0B9F\u0B99\u0BCD\u0B95\u0BC1\u0BAE\u0BCD.",
      TournamentStartSubject: "\u0B89\u0B99\u0BCD\u0B95\u0BB3\u0BCD {{- metaGame}} \u0BAA\u0BCB\u0B9F\u0BCD\u0B9F\u0BBF \u0BA4\u0BCA\u0B9F\u0B99\u0BCD\u0B95\u0BBF\u0BAF\u0BA4\u0BC1",
      TournamentCancelBody: "{{- metaGame}}\u0BA4\u0BCA\u0B9F\u0BB0\u0BBF\u0BA9\u0BCD {{number}} \u0BAA\u0BCB\u0B9F\u0BCD\u0B9F\u0BBF\u0B95\u0BB3\u0BC1\u0B95\u0BCD\u0B95\u0BC1\u0BAA\u0BCD \u0BAA\u0BCB\u0BA4\u0BC1\u0BAE\u0BBE\u0BA9 \u0BB5\u0BC0\u0BB0\u0BB0\u0BCD\u0B95\u0BB3\u0BCD \u0BAA\u0BA4\u0BBF\u0BB5\u0BC1\u0BAA\u0BC6\u0BB1\u0BB5\u0BBF\u0BB2\u0BCD\u0BB2\u0BC8, \u0BAE\u0BC7\u0BB2\u0BC1\u0BAE\u0BCD \u0BAA\u0BCB\u0B9F\u0BCD\u0B9F\u0BBF\u0BAF\u0BC8 \u0BB0\u0BA4\u0BCD\u0BA4\u0BC1 \u0B9A\u0BC6\u0BAF\u0BCD\u0BAF \u0BB5\u0BC7\u0BA3\u0BCD\u0B9F\u0BBF\u0BAF\u0BBF\u0BB0\u0BC1\u0BA8\u0BCD\u0BA4\u0BA4\u0BC1.",
      TournamentCancelBodyVariants: "{{number}} {{- metaGame}}, \u0BAE\u0BBE\u0BB1\u0BC1\u0BAA\u0BBE\u0B9F\u0BC1\u0B95\u0BB3\u0BCD:{{variants}} \u0BA4\u0BCA\u0B9F\u0BB0\u0BBF\u0BA9\u0BCD \u0BAA\u0BCB\u0B9F\u0BCD\u0B9F\u0BBF\u0B95\u0BB3\u0BC1\u0B95\u0BCD\u0B95\u0BC1\u0BAA\u0BCD \u0BAA\u0BCB\u0BA4\u0BC1\u0BAE\u0BBE\u0BA9 \u0BB5\u0BC0\u0BB0\u0BB0\u0BCD\u0B95\u0BB3\u0BCD \u0BAA\u0BA4\u0BBF\u0BB5\u0BC1\u0BAA\u0BC6\u0BB1\u0BB5\u0BBF\u0BB2\u0BCD\u0BB2\u0BC8, \u0BAE\u0BC7\u0BB2\u0BC1\u0BAE\u0BCD \u0BAA\u0BCB\u0B9F\u0BCD\u0B9F\u0BBF\u0BAF\u0BC8 \u0BB0\u0BA4\u0BCD\u0BA4\u0BC1 \u0B9A\u0BC6\u0BAF\u0BCD\u0BAF \u0BB5\u0BC7\u0BA3\u0BCD\u0B9F\u0BBF\u0BAF\u0BBF\u0BB0\u0BC1\u0BA8\u0BCD\u0BA4\u0BA4\u0BC1.",
      TournamentCancelSubject: "\u0B89\u0B99\u0BCD\u0B95\u0BB3\u0BCD {{- metaGame}} \u0BAA\u0BCB\u0B9F\u0BCD\u0B9F\u0BBF \u0BB0\u0BA4\u0BCD\u0BA4\u0BC1 \u0B9A\u0BC6\u0BAF\u0BCD\u0BAF\u0BAA\u0BCD\u0BAA\u0B9F\u0BCD\u0B9F\u0BA4\u0BC1",
      TournamentEndBody: "{{- metaGame}} \u0BA4\u0BCA\u0B9F\u0BB0\u0BBF\u0BA9\u0BCD \u0BAA\u0BCB\u0B9F\u0BCD\u0B9F\u0BBF {{number}} \u0BAE\u0BC1\u0B9F\u0BBF\u0BA8\u0BCD\u0BA4\u0BA4\u0BC1. https://play.abstractplay.com/tournament/{{tournamentId}} \u0B90\u0BAA\u0BCD \u0BAA\u0BBE\u0BB0\u0BCD\u0B95\u0BCD\u0B95\u0BB5\u0BC1\u0BAE\u0BCD. \u0BA4\u0BCA\u0B9F\u0BB0\u0BBF\u0BA9\u0BCD \u0B85\u0B9F\u0BC1\u0BA4\u0BCD\u0BA4 \u0BAA\u0BCB\u0B9F\u0BCD\u0B9F\u0BBF \u0B92\u0BB0\u0BC1 \u0BB5\u0BBE\u0BB0\u0BA4\u0BCD\u0BA4\u0BBF\u0BB2\u0BCD \u0BA4\u0BCA\u0B9F\u0B99\u0BCD\u0B95\u0BC1\u0BAE\u0BCD.",
      TournamentEndBodyVariants: "{{number}} {{- metaGame}}, \u0BAE\u0BBE\u0BB1\u0BC1\u0BAA\u0BBE\u0B9F\u0BC1\u0B95\u0BB3\u0BCD: {{variants}}\u0BA4\u0BCA\u0B9F\u0BB0\u0BCD \u0BAE\u0BC1\u0B9F\u0BBF\u0BA8\u0BCD\u0BA4\u0BC1\u0BB5\u0BBF\u0B9F\u0BCD\u0B9F\u0BA4\u0BC1. https://play.abstractplay.com/tournament/{{tournamentId}} \u0B90\u0BAA\u0BCD \u0BAA\u0BBE\u0BB0\u0BCD\u0B95\u0BCD\u0B95\u0BB5\u0BC1\u0BAE\u0BCD. \u0BA4\u0BCA\u0B9F\u0BB0\u0BBF\u0BA9\u0BCD \u0B85\u0B9F\u0BC1\u0BA4\u0BCD\u0BA4 \u0BAA\u0BCB\u0B9F\u0BCD\u0B9F\u0BBF \u0B92\u0BB0\u0BC1 \u0BB5\u0BBE\u0BB0\u0BA4\u0BCD\u0BA4\u0BBF\u0BB2\u0BCD \u0BA4\u0BCA\u0B9F\u0B99\u0BCD\u0B95\u0BC1\u0BAE\u0BCD.",
      TournamentEndSubject: "\u0B89\u0B99\u0BCD\u0B95\u0BB3\u0BCD {{- metaGame}} \u0BAA\u0BCB\u0B9F\u0BCD\u0B9F\u0BBF \u0BAE\u0BC1\u0B9F\u0BBF\u0BA8\u0BCD\u0BA4\u0BA4\u0BC1",
      TournamentRemoveBody: "\u0BA8\u0BC0\u0B99\u0BCD\u0B95\u0BB3\u0BCD \u0BAA\u0BA4\u0BBF\u0BB5\u0BC1\u0B9A\u0BC6\u0BAF\u0BCD\u0BA4 {{- metaGame}} \u0BAA\u0BCB\u0B9F\u0BCD\u0B9F\u0BBF\u0BAF\u0BBF\u0BB2\u0BBF\u0BB0\u0BC1\u0BA8\u0BCD\u0BA4\u0BC1 \u0B85\u0B95\u0BB1\u0BCD\u0BB1\u0BAA\u0BCD\u0BAA\u0B9F\u0BCD\u0B9F\u0BC0\u0BB0\u0BCD\u0B95\u0BB3\u0BCD, \u0B8F\u0BA9\u0BC6\u0BA9\u0BCD\u0BB1\u0BBE\u0BB2\u0BCD \u0BA8\u0BC0\u0B99\u0BCD\u0B95\u0BB3\u0BCD \u0B87\u0BA9\u0BCD\u0BA9\u0BC1\u0BAE\u0BCD \u0B86\u0BB0\u0BCD\u0BB5\u0BAE\u0BBE\u0B95 \u0B87\u0BB0\u0BC1\u0B95\u0BCD\u0B95\u0BBF\u0BB1\u0BC0\u0BB0\u0BCD\u0B95\u0BB3\u0BBE \u0B8E\u0BA9\u0BCD\u0BAA\u0BA4\u0BC1 \u0BA4\u0BC6\u0BB3\u0BBF\u0BB5\u0BBE\u0B95\u0BA4\u0BCD \u0BA4\u0BC6\u0BB0\u0BBF\u0BAF\u0BB5\u0BBF\u0BB2\u0BCD\u0BB2\u0BC8. \u0BA8\u0BC0\u0B99\u0BCD\u0B95\u0BB3\u0BCD \u0B87\u0BA9\u0BCD\u0BA9\u0BC1\u0BAE\u0BCD \u0BAA\u0B99\u0BCD\u0B95\u0BC7\u0BB1\u0BCD\u0B95 \u0BB5\u0BBF\u0BB0\u0BC1\u0BAE\u0BCD\u0BAA\u0BBF\u0BA9\u0BBE\u0BB2\u0BCD, \u0BA4\u0BAF\u0BB5\u0BC1\u0B9A\u0BC6\u0BAF\u0BCD\u0BA4\u0BC1 https://play.abstractplay.com/tournanents \u0B87\u0BB2\u0BCD \u0BAE\u0BC0\u0BA3\u0BCD\u0B9F\u0BC1\u0BAE\u0BCD \u0BAA\u0BA4\u0BBF\u0BB5\u0BC1\u0BAA\u0BC6\u0BB1\u0BC1\u0B95.",
      TournamentRemoveBodyVariants: "You were removed \u0B87\u0BB0\u0BC1\u0BA8\u0BCD\u0BA4\u0BC1 the {{- metaGame}}, variants: {{variants}} tournament you were signed \u0BAE\u0BC7\u0BB2\u0BC7 for, because it is unclear whether you \u0B85\u0BB0\u0BC7 still interested. \u0BA8\u0BC0\u0B99\u0BCD\u0B95\u0BB3\u0BCD \u0B87\u0BA9\u0BCD\u0BA9\u0BC1\u0BAE\u0BCD \u0BAA\u0B99\u0BCD\u0B95\u0BC7\u0BB1\u0BCD\u0B95 \u0BB5\u0BBF\u0BB0\u0BC1\u0BAE\u0BCD\u0BAA\u0BBF\u0BA9\u0BBE\u0BB2\u0BCD, \u0BA4\u0BAF\u0BB5\u0BC1\u0B9A\u0BC6\u0BAF\u0BCD\u0BA4\u0BC1 https://play.abstractplay.com/tournanents \u0B87\u0BB2\u0BCD \u0BAE\u0BC0\u0BA3\u0BCD\u0B9F\u0BC1\u0BAE\u0BCD \u0BAA\u0BA4\u0BBF\u0BB5\u0BC1\u0BAA\u0BC6\u0BB1\u0BC1\u0B95.",
      TournamentRemoveSubject: "\u0BA8\u0BC0\u0B99\u0BCD\u0B95\u0BB3\u0BCD \u0B92\u0BB0\u0BC1 \u0BAA\u0BCB\u0B9F\u0BCD\u0B9F\u0BBF\u0BAF\u0BBF\u0BB2\u0BCD \u0B87\u0BB0\u0BC1\u0BA8\u0BCD\u0BA4\u0BC1 \u0B85\u0B95\u0BB1\u0BCD\u0BB1\u0BAA\u0BCD\u0BAA\u0B9F\u0BCD\u0B9F\u0BC0\u0BB0\u0BCD\u0B95\u0BB3\u0BCD"
    };
  }
});

// lib/wsBroadcast.ts
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
async function wsBroadcast(verb, payload, exclude) {
  const body = {
    verb,
    payload,
    exclude
  };
  const input = {
    QueueUrl: process.env.WEBSOCKET_SQS,
    MessageBody: JSON.stringify(body)
  };
  const cmd = new SendMessageCommand(input);
  return sqsClient.send(cmd);
}
var REGION, sqsClient;
var init_wsBroadcast = __esm({
  "lib/wsBroadcast.ts"() {
    "use strict";
    REGION = "us-east-1";
    sqsClient = new SQSClient({ region: REGION });
  }
});

// lib/commentAuth.ts
import { GetCommand } from "@aws-sdk/lib-dynamodb";
function gameRecordSk(metaGame, cbit, gameId) {
  return `${metaGame}#${cbit}#${gameId}`;
}
async function getGameRecord(client, tableName2, metaGame, gameId, cbit) {
  const data = await client.send(
    new GetCommand({
      TableName: tableName2,
      Key: {
        pk: "GAME",
        sk: gameRecordSk(metaGame, cbit, gameId)
      }
    })
  );
  if (data.Item === void 0) {
    return void 0;
  }
  const game2 = data.Item;
  if (!Array.isArray(game2.players)) {
    return { players: [] };
  }
  return game2;
}
async function isSiteAdmin(client, tableName2, userid) {
  const user = await client.send(
    new GetCommand({
      TableName: tableName2,
      Key: {
        pk: "USER",
        sk: userid
      }
    })
  );
  return user.Item !== void 0 && user.Item.admin === true;
}
function isGameParticipant(game2, userid) {
  return game2.players.some((p) => p.id === userid);
}
async function checkInGameCommentAuth(client, tableName2, userid, metaGame, gameId) {
  if (!userid) {
    return { ok: true };
  }
  const activeGame = await getGameRecord(client, tableName2, metaGame, gameId, 0);
  if (activeGame !== void 0) {
    if (isGameParticipant(activeGame, userid)) {
      return { ok: true };
    }
    if (await isSiteAdmin(client, tableName2, userid)) {
      return { ok: true };
    }
    return {
      ok: false,
      message: "Only game participants and admins can comment on active games."
    };
  }
  const completedGame = await getGameRecord(client, tableName2, metaGame, gameId, 1);
  if (completedGame !== void 0) {
    return {
      ok: false,
      message: "Game is completed; use save_exploration for post-game comments."
    };
  }
  return {
    ok: false,
    message: "Game not found."
  };
}
var init_commentAuth = __esm({
  "lib/commentAuth.ts"() {
    "use strict";
  }
});

// lib/gameState.ts
import { gzipSync, gunzipSync } from "zlib";
function stateByteLength(state) {
  return Buffer.byteLength(state, "utf8");
}
function isGzipBuffer(buf) {
  return buf.length >= 2 && buf[0] === 31 && buf[1] === 139;
}
function isCompressedGameState(state) {
  if (!state || state.startsWith("{") || state.startsWith("[")) {
    return false;
  }
  if (state.startsWith(COMPRESSED_PREFIX)) {
    return true;
  }
  try {
    const buf = Buffer.from(state, "base64");
    return isGzipBuffer(buf);
  } catch {
    return false;
  }
}
function gunzipBase64(base64) {
  return gunzipSync(Buffer.from(base64, "base64")).toString("utf8");
}
function decompressGameState(state) {
  if (!state || state.startsWith("{") || state.startsWith("[")) {
    return state;
  }
  if (state.startsWith(COMPRESSED_PREFIX)) {
    return gunzipBase64(state.slice(COMPRESSED_PREFIX.length));
  }
  try {
    const buf = Buffer.from(state, "base64");
    if (isGzipBuffer(buf)) {
      return gunzipSync(buf).toString("utf8");
    }
  } catch {
  }
  return state;
}
function gzipToPrefixedBase64(state) {
  const compressed = gzipSync(Buffer.from(state, "utf8"));
  return COMPRESSED_PREFIX + compressed.toString("base64");
}
function assertStoredStateSize(state) {
  const bytes = stateByteLength(state);
  if (bytes > GAME_STATE_MAX_STORED_BYTES) {
    throw new Error(
      `Game state is ${bytes} bytes after compression (limit ${GAME_STATE_MAX_STORED_BYTES}); DynamoDB item would exceed the 400KB limit`
    );
  }
}
function compressGameStateIfNeeded(state) {
  if (isCompressedGameState(state)) {
    return state;
  }
  if (stateByteLength(state) <= GAME_STATE_COMPRESS_THRESHOLD_BYTES) {
    return state;
  }
  const compressed = gzipToPrefixedBase64(state);
  assertStoredStateSize(compressed);
  return compressed;
}
function hydrateGameState(record) {
  const decompressed = decompressGameState(record.state);
  if (decompressed === record.state) {
    return record;
  }
  return { ...record, state: decompressed };
}
function prepareGameStateForStorage(record) {
  const compressed = compressGameStateIfNeeded(record.state);
  if (compressed === record.state) {
    return record;
  }
  return { ...record, state: compressed };
}
function hydratePlaygroundBody(record) {
  const decompressed = decompressGameState(record.body);
  if (decompressed === record.body) {
    return record;
  }
  return { ...record, body: decompressed };
}
function preparePlaygroundBodyForStorage(record) {
  const compressed = compressGameStateIfNeeded(record.body);
  if (compressed === record.body) {
    return record;
  }
  return { ...record, body: compressed };
}
function setGameEndedFromEngine(game2, engine) {
  if (!engine.gameover) {
    return;
  }
  game2.gameEnded = new Date(engine.stack[engine.stack.length - 1]._timestamp).getTime();
  game2.winner = engine.winner;
  if (game2.gameStarted === void 0 && engine.stack.length > 0) {
    game2.gameStarted = new Date(engine.stack[0]._timestamp).getTime();
  }
}
var GAME_STATE_COMPRESS_THRESHOLD_BYTES, GAME_STATE_MAX_STORED_BYTES, COMPRESSED_PREFIX;
var init_gameState = __esm({
  "lib/gameState.ts"() {
    "use strict";
    GAME_STATE_COMPRESS_THRESHOLD_BYTES = 3e5;
    GAME_STATE_MAX_STORED_BYTES = 39e4;
    COMPRESSED_PREFIX = "gz:";
  }
});

// lib/ddb.ts
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
var REGION2, clnt, ddbDocClient;
var init_ddb = __esm({
  "lib/ddb.ts"() {
    "use strict";
    REGION2 = "us-east-1";
    clnt = new DynamoDBClient({ region: REGION2 });
    ddbDocClient = DynamoDBDocumentClient.from(clnt, {
      marshallOptions: {
        convertEmptyValues: false,
        removeUndefinedValues: true,
        convertClassInstanceToMap: false
      },
      unmarshallOptions: {
        wrapNumbers: false
      }
    });
  }
});

// lib/participants.ts
import { GetCommand as GetCommand2 } from "@aws-sdk/lib-dynamodb";
function toClientBot(item) {
  if (!item) {
    return void 0;
  }
  return {
    pk: "BOT",
    sk: item.sk,
    name: item.name,
    endpoint: item.endpoint,
    owner: item.owner,
    lastseen: item.lastseen ?? 0,
    description: item.description,
    supported: item.supported,
    pendingSecretId: item.pendingSecretId,
    pendingSecretCreatedAt: item.pendingSecretCreatedAt,
    secretRotationPending: item.pendingSecretId !== void 0 && item.pendingSecretId !== ""
  };
}
async function getBotRecord(clientId) {
  const data = await ddbDocClient.send(
    new GetCommand2({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: { pk: "BOT", sk: clientId }
    })
  );
  return data.Item;
}
async function isBotId(id) {
  const bot = await getBotRecord(id);
  return bot !== void 0;
}
async function getParticipant(id) {
  const bot = await getBotRecord(id);
  if (bot) {
    return { id: bot.sk, name: bot.name, isBot: true };
  }
  const data = await ddbDocClient.send(
    new GetCommand2({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: { pk: "USER", sk: id }
    })
  );
  if (!data.Item) {
    return void 0;
  }
  const user = data.Item;
  return {
    id: user.id ?? id,
    name: user.name,
    isBot: false,
    email: user.email,
    language: user.language,
    settings: user.settings,
    ratings: user.ratings
  };
}
async function getParticipants(ids) {
  const participants = await Promise.all(ids.map((id) => getParticipant(id)));
  return participants.filter((p) => p !== void 0);
}
async function filterHumanIds(ids) {
  const humanIds = [];
  for (const id of ids) {
    if (!await isBotId(id)) {
      humanIds.push(id);
    }
  }
  return humanIds;
}
function botToFullUserStub(bot) {
  return {
    id: bot.sk,
    name: bot.name,
    email: "",
    language: "en",
    country: "",
    admin: false,
    organizer: false,
    settings: {}
  };
}
var init_participants = __esm({
  "lib/participants.ts"() {
    "use strict";
    init_ddb();
  }
});

// lib/userGameOverlay.ts
import {
  DeleteCommand,
  QueryCommand,
  UpdateCommand
} from "@aws-sdk/lib-dynamodb";
async function queryOverlayRows(client, tableName2, userId) {
  const items = [];
  let lastEvaluatedKey;
  do {
    const page = await client.send(new QueryCommand({
      TableName: tableName2,
      KeyConditionExpression: "#pk = :pk",
      ExpressionAttributeNames: { "#pk": "pk" },
      ExpressionAttributeValues: { ":pk": `USERGAME#${userId}` },
      ExclusiveStartKey: lastEvaluatedKey
    }));
    for (const item of page.Items ?? []) {
      items.push(item);
    }
    lastEvaluatedKey = page.LastEvaluatedKey;
  } while (lastEvaluatedKey);
  return items;
}
async function listUserGameOverlays(client, tableName2, userId) {
  const rows = await queryOverlayRows(client, tableName2, userId);
  const overlays = /* @__PURE__ */ new Map();
  for (const row of rows) {
    const gameId = row.sk;
    if (!gameId) {
      continue;
    }
    const overlay = {};
    if (row.seen !== void 0) {
      overlay.seen = row.seen;
    }
    if (row.lastChat !== void 0) {
      overlay.lastChat = row.lastChat;
    }
    overlays.set(gameId, overlay);
  }
  return overlays;
}
async function upsertUserGameOverlay(client, tableName2, userId, gameId, fields) {
  const parts = [];
  const values = {};
  if (fields.seen !== void 0) {
    parts.push("seen = :seen");
    values[":seen"] = fields.seen;
  }
  if (fields.lastChat !== void 0) {
    parts.push("lastChat = :lc");
    values[":lc"] = fields.lastChat;
  }
  if (parts.length === 0) {
    return;
  }
  await client.send(new UpdateCommand({
    TableName: tableName2,
    Key: { pk: `USERGAME#${userId}`, sk: gameId },
    UpdateExpression: `SET ${parts.join(", ")}`,
    ExpressionAttributeValues: values
  }));
}
async function deleteUserGameOverlay(client, tableName2, userId, gameId) {
  await client.send(new DeleteCommand({
    TableName: tableName2,
    Key: { pk: `USERGAME#${userId}`, sk: gameId }
  }));
}
function applyOverlayFields(game2, overlay) {
  const seen = overlay?.seen;
  const lastChat = overlay?.lastChat;
  const result = { ...game2 };
  if (seen !== void 0) {
    result.seen = seen;
  } else {
    delete result.seen;
  }
  if (lastChat !== void 0) {
    result.lastChat = lastChat;
  } else {
    delete result.lastChat;
  }
  return result;
}
var init_userGameOverlay = __esm({
  "lib/userGameOverlay.ts"() {
    "use strict";
  }
});

// lib/gameProjector.ts
import {
  BatchWriteCommand,
  DeleteCommand as DeleteCommand2,
  PutCommand,
  UpdateCommand as UpdateCommand2
} from "@aws-sdk/lib-dynamodb";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import { GameFactory } from "@abstractplay/gameslib";
function shouldKeepCompletedGame(game2, numMoves) {
  if (game2.numPlayers === 1) {
    return numMoves > 0;
  }
  return numMoves > game2.numPlayers;
}
async function ensureShardedMetaGameCountEntry(docClient2, tableName2, metaGame) {
  await docClient2.send(new UpdateCommand2({
    TableName: tableName2,
    Key: { pk: `METAGAMES#${metaGame}`, sk: "COUNTS" },
    UpdateExpression: [
      "SET currentgames = if_not_exists(currentgames, :z)",
      "completedgames = if_not_exists(completedgames, :z)",
      "standingchallenges = if_not_exists(standingchallenges, :z)",
      "stars = if_not_exists(stars, :z)",
      "ratingsCount = if_not_exists(ratingsCount, :z)"
    ].join(", "),
    ExpressionAttributeValues: { ":z": 0 }
  }));
}
async function ensureShardedMetaGameCounts(docClient2, tableName2, metaGame) {
  await ensureShardedMetaGameCountEntry(docClient2, tableName2, metaGame);
}
async function adjustShardedCounts(docClient2, tableName2, metaGame, deltas) {
  await ensureShardedMetaGameCounts(docClient2, tableName2, metaGame);
  const parts = [];
  const values = { ":z": 0 };
  if (deltas.currentgames !== void 0) {
    parts.push("currentgames = if_not_exists(currentgames, :z) + :cg");
    values[":cg"] = deltas.currentgames;
  }
  if (deltas.completedgames !== void 0) {
    parts.push("completedgames = if_not_exists(completedgames, :z) + :cd");
    values[":cd"] = deltas.completedgames;
  }
  if (deltas.standingchallenges !== void 0) {
    parts.push("standingchallenges = if_not_exists(standingchallenges, :z) + :sc");
    values[":sc"] = deltas.standingchallenges;
  }
  if (deltas.stars !== void 0) {
    parts.push("stars = if_not_exists(stars, :z) + :st");
    values[":st"] = deltas.stars;
  }
  if (deltas.ratingsCount !== void 0) {
    parts.push("ratingsCount = if_not_exists(ratingsCount, :z) + :rc");
    values[":rc"] = deltas.ratingsCount;
  }
  if (parts.length === 0) {
    return;
  }
  await docClient2.send(new UpdateCommand2({
    TableName: tableName2,
    Key: { pk: `METAGAMES#${metaGame}`, sk: "COUNTS" },
    UpdateExpression: `SET ${parts.join(", ")}`,
    ExpressionAttributeValues: values
  }));
}
async function deleteCurrentGamesForPlayers(docClient2, tableName2, gameId, playerIds) {
  await Promise.all(playerIds.map(
    (playerId) => docClient2.send(new DeleteCommand2({
      TableName: tableName2,
      Key: { pk: `CURRENTGAMES#${playerId}`, sk: gameId }
    }))
  ));
}
async function deleteRecentCompletedForPlayers(docClient2, tableName2, gameId, playerIds) {
  await Promise.all(playerIds.map(
    (playerId) => docClient2.send(new DeleteCommand2({
      TableName: tableName2,
      Key: { pk: `RECENTCOMPLETED#${playerId}`, sk: gameId }
    }))
  ));
}
async function deleteUserGameOverlaysForPlayers(docClient2, tableName2, gameId, playerIds) {
  await Promise.all(playerIds.map(
    (playerId) => deleteUserGameOverlay(docClient2, tableName2, playerId, gameId)
  ));
}
async function purgeActiveGameDashboardIndexes(docClient2, tableName2, game2, playerIds) {
  await deleteCurrentGamesForPlayers(docClient2, tableName2, game2.id, playerIds);
  await deleteUserGameOverlaysForPlayers(docClient2, tableName2, game2.id, playerIds);
  await adjustShardedCounts(docClient2, tableName2, game2.metaGame, { currentgames: -1 });
}
async function purgeCompletedGameDashboardIndexes(docClient2, tableName2, game2, playerIds) {
  await deleteCompletedGameIndexes(docClient2, tableName2, game2);
  await deleteRecentCompletedForPlayers(docClient2, tableName2, game2.id, playerIds);
  await deleteUserGameOverlaysForPlayers(docClient2, tableName2, game2.id, playerIds);
}
async function deleteCompletedGameIndexes(docClient2, tableName2, game2) {
  const sk = `${game2.lastMoveTime}#${game2.id}`;
  const keys = [
    { pk: `COMPLETEDGAMES#${game2.metaGame}`, sk },
    ...game2.players.map((p) => ({ pk: `COMPLETEDGAMES#${p.id}`, sk }))
  ];
  for (let i = 0; i < keys.length; i += 25) {
    const chunk = keys.slice(i, i + 25);
    await docClient2.send(new BatchWriteCommand({
      RequestItems: {
        [tableName2]: chunk.map((key) => ({
          DeleteRequest: { Key: key }
        }))
      }
    }));
  }
}
var init_gameProjector = __esm({
  "lib/gameProjector.ts"() {
    "use strict";
    init_gameState();
    init_participants();
    init_userGameOverlay();
  }
});

// lib/playerGameMarks.ts
import { GameFactory as GameFactory2 } from "@abstractplay/gameslib";
import {
  DeleteCommand as DeleteCommand3,
  GetCommand as GetCommand3,
  PutCommand as PutCommand2,
  QueryCommand as QueryCommand2,
  UpdateCommand as UpdateCommand3
} from "@aws-sdk/lib-dynamodb";
function isCompletedToMove(toMove) {
  return toMove === "" || toMove === null || toMove === void 0;
}
async function queryAllItems(client, params2) {
  const items = [];
  let lastKey;
  do {
    const result = await client.send(new QueryCommand2({
      ...params2,
      ExclusiveStartKey: lastKey
    }));
    if (result.Items) {
      items.push(...result.Items);
    }
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);
  return items;
}
async function getGameRecord2(client, tableName2, metaGame, gameId, cbit) {
  const data = await client.send(
    new GetCommand3({
      TableName: tableName2,
      Key: {
        pk: "GAME",
        sk: gameRecordSk(metaGame, cbit, gameId)
      }
    })
  );
  if (data.Item === void 0) {
    return void 0;
  }
  const game2 = data.Item;
  if (!Array.isArray(game2.players)) {
    game2.players = [];
  }
  return game2;
}
async function loadGameForMark(client, tableName2, metaGame, gameId, preferCompleted = false) {
  if (preferCompleted) {
    const completed2 = await getGameRecord2(client, tableName2, metaGame, gameId, 1);
    if (completed2 !== void 0) {
      return { game: completed2, cbit: 1 };
    }
    return void 0;
  }
  const active = await getGameRecord2(client, tableName2, metaGame, gameId, 0);
  if (active !== void 0) {
    return { game: active, cbit: 0 };
  }
  const completed = await getGameRecord2(client, tableName2, metaGame, gameId, 1);
  if (completed !== void 0) {
    return { game: completed, cbit: 1 };
  }
  return void 0;
}
function applyEngineToSummary(source, summary, completed) {
  if (!source.state) {
    return;
  }
  try {
    const stateStr = decompressGameState(source.state);
    const engine = GameFactory2(source.metaGame, stateStr);
    if (!engine) {
      return;
    }
    const lastTs = new Date(engine.stack[engine.stack.length - 1]._timestamp).getTime();
    if (summary.numMoves === void 0) {
      summary.numMoves = engine.stack.length - 1;
    }
    if (summary.gameStarted === void 0) {
      summary.gameStarted = new Date(engine.stack[0]._timestamp).getTime();
    }
    if (summary.variants === void 0) {
      summary.variants = engine.variants;
    }
    if (completed && summary.gameEnded === void 0) {
      summary.gameEnded = lastTs;
    }
    if (engine.gameover) {
      if (summary.gameEnded === void 0) {
        summary.gameEnded = lastTs;
      }
      if (summary.winner === void 0) {
        summary.winner = engine.winner;
      }
    }
  } catch {
  }
}
function buildGameSummary(source) {
  const summary = {
    id: source.id,
    metaGame: source.metaGame,
    players: source.players,
    clockHard: source.clockHard,
    noExplore: source.noExplore ?? false,
    lastMoveTime: source.lastMoveTime
  };
  if (source.gameStarted !== void 0) {
    summary.gameStarted = source.gameStarted;
  }
  if (source.gameEnded !== void 0) {
    summary.gameEnded = source.gameEnded;
  }
  if (source.winner !== void 0) {
    summary.winner = source.winner;
  }
  if (source.variants !== void 0) {
    summary.variants = source.variants;
  }
  if (source.commented !== void 0) {
    summary.commented = source.commented;
  }
  const completed = isCompletedToMove(source.toMove);
  if (!completed) {
    summary.toMove = source.toMove;
  }
  if (source.numMoves !== void 0) {
    summary.numMoves = source.numMoves;
  }
  const needsEngine = summary.numMoves === void 0 || summary.gameStarted === void 0 || summary.variants === void 0 || completed && summary.gameEnded === void 0 || completed && summary.winner === void 0;
  if (needsEngine) {
    applyEngineToSummary(source, summary, completed);
  }
  if (completed && summary.gameEnded === void 0) {
    summary.gameEnded = source.lastMoveTime;
  }
  return summary;
}
function gameAsRecord(source) {
  return {
    pk: "GAME",
    sk: gameRecordSk(source.metaGame, isCompletedToMove(source.toMove) ? 1 : 0, source.id),
    id: source.id,
    metaGame: source.metaGame,
    numPlayers: source.numPlayers,
    players: source.players,
    clockHard: source.clockHard,
    noExplore: source.noExplore,
    toMove: source.toMove,
    lastMoveTime: source.lastMoveTime,
    gameStarted: source.gameStarted,
    gameEnded: source.gameEnded,
    winner: source.winner,
    numMoves: source.numMoves,
    variants: source.variants,
    commented: source.commented,
    state: source.state ?? ""
  };
}
function isQualityCompletedGame(source, summary) {
  const numMoves = summary.numMoves ?? 0;
  return shouldKeepCompletedGame(gameAsRecord(source), numMoves);
}
async function getUserName(client, tableName2, userId) {
  const user = await client.send(
    new GetCommand3({
      TableName: tableName2,
      Key: { pk: "USER", sk: userId }
    })
  );
  if (user.Item?.name && typeof user.Item.name === "string") {
    return user.Item.name;
  }
  const users = await client.send(
    new GetCommand3({
      TableName: tableName2,
      Key: { pk: "USERS", sk: userId }
    })
  );
  if (users.Item?.name && typeof users.Item.name === "string") {
    return users.Item.name;
  }
  return userId;
}
function representativeUserSk(metaGame, gameId) {
  return `REPRESENTATIVE#${metaGame}#${gameId}`;
}
function representativeMetaSk(userId, gameId) {
  return `${userId}#${gameId}`;
}
async function watchGame(client, tableName2, userId, metaGame, gameId) {
  const loaded = await loadGameForMark(client, tableName2, metaGame, gameId);
  if (loaded === void 0) {
    return { ok: false, message: "Game not found." };
  }
  const authGame = { players: loaded.game.players };
  if (isGameParticipant(authGame, userId)) {
    return { ok: false, message: "Participants cannot watch their own games." };
  }
  const summary = buildGameSummary(loaded.game);
  const now = Date.now();
  await Promise.all([
    client.send(new PutCommand2({
      TableName: tableName2,
      Item: {
        pk: `WATCHED#${userId}`,
        sk: gameId,
        ...summary,
        addedAt: now
      }
    })),
    client.send(new PutCommand2({
      TableName: tableName2,
      Item: {
        pk: `GAMEWATCHERS#${gameId}`,
        sk: userId
      }
    }))
  ]);
  return { ok: true };
}
async function unwatchGame(client, tableName2, userId, gameId) {
  await Promise.all([
    client.send(new DeleteCommand3({
      TableName: tableName2,
      Key: { pk: `WATCHED#${userId}`, sk: gameId }
    })),
    client.send(new DeleteCommand3({
      TableName: tableName2,
      Key: { pk: `GAMEWATCHERS#${gameId}`, sk: userId }
    }))
  ]);
  return { ok: true };
}
async function listWatchedGames(client, tableName2, userId) {
  const items = await queryAllItems(client, {
    TableName: tableName2,
    KeyConditionExpression: "#pk = :pk",
    ExpressionAttributeNames: { "#pk": "pk" },
    ExpressionAttributeValues: { ":pk": `WATCHED#${userId}` }
  });
  return items.map((item) => item);
}
async function highlightGame(client, tableName2, userId, metaGame, gameId) {
  const loaded = await loadGameForMark(client, tableName2, metaGame, gameId);
  if (loaded === void 0) {
    return { ok: false, message: "Game not found." };
  }
  const authGame = { players: loaded.game.players };
  if (!isGameParticipant(authGame, userId)) {
    return { ok: false, message: "Only participants can highlight a game." };
  }
  const summary = buildGameSummary(loaded.game);
  await client.send(new PutCommand2({
    TableName: tableName2,
    Item: {
      pk: `HIGHLIGHT#${userId}`,
      sk: `${metaGame}#${gameId}`,
      addedAt: Date.now(),
      ...summary
    }
  }));
  return { ok: true };
}
async function unhighlightGame(client, tableName2, userId, metaGame, gameId) {
  await client.send(new DeleteCommand3({
    TableName: tableName2,
    Key: { pk: `HIGHLIGHT#${userId}`, sk: `${metaGame}#${gameId}` }
  }));
  return { ok: true };
}
async function listHighlights(client, tableName2, userId) {
  const items = await queryAllItems(client, {
    TableName: tableName2,
    KeyConditionExpression: "#pk = :pk",
    ExpressionAttributeNames: { "#pk": "pk" },
    ExpressionAttributeValues: { ":pk": `HIGHLIGHT#${userId}` }
  });
  return items.map((item) => item).sort((a, b) => (a.addedAt ?? 0) - (b.addedAt ?? 0));
}
async function countUserRecommendationsForMetaGame(client, tableName2, userId, metaGame) {
  const items = await queryAllItems(client, {
    TableName: tableName2,
    KeyConditionExpression: "#pk = :pk AND begins_with(#sk, :prefix)",
    ExpressionAttributeNames: { "#pk": "pk", "#sk": "sk" },
    ExpressionAttributeValues: {
      ":pk": `PLAYER#${userId}`,
      ":prefix": `REPRESENTATIVE#${metaGame}#`
    }
  });
  return items.length;
}
async function recommendGame(client, tableName2, userId, metaGame, gameId) {
  const loaded = await loadGameForMark(client, tableName2, metaGame, gameId, true);
  if (loaded === void 0 || loaded.cbit !== 1) {
    return { ok: false, message: "Only completed games can be recommended." };
  }
  if (loaded.game.metaGame !== metaGame) {
    return { ok: false, message: "metaGame does not match the game." };
  }
  if (!isCompletedToMove(loaded.game.toMove)) {
    return { ok: false, message: "Only completed games can be recommended." };
  }
  const summary = buildGameSummary(loaded.game);
  if (!isQualityCompletedGame(loaded.game, summary)) {
    return { ok: false, message: "This game is too short to recommend." };
  }
  const existingSk = representativeUserSk(metaGame, gameId);
  const existing = await client.send(new GetCommand3({
    TableName: tableName2,
    Key: { pk: `PLAYER#${userId}`, sk: existingSk }
  }));
  if (existing.Item !== void 0) {
    return { ok: true };
  }
  const count = await countUserRecommendationsForMetaGame(client, tableName2, userId, metaGame);
  if (count >= MAX_RECOMMENDATIONS_PER_METAGAME) {
    return {
      ok: false,
      message: `You can only recommend ${MAX_RECOMMENDATIONS_PER_METAGAME} games per metaGame.`
    };
  }
  const userName = await getUserName(client, tableName2, userId);
  const addedAt = Date.now();
  const repItem = {
    userId,
    userName,
    addedAt,
    ...summary
  };
  await Promise.all([
    client.send(new PutCommand2({
      TableName: tableName2,
      Item: {
        pk: `REPRESENTATIVE#${metaGame}`,
        sk: representativeMetaSk(userId, gameId),
        ...repItem
      }
    })),
    client.send(new PutCommand2({
      TableName: tableName2,
      Item: {
        pk: `PLAYER#${userId}`,
        sk: existingSk,
        addedAt,
        ...summary
      }
    }))
  ]);
  return { ok: true };
}
async function unrecommendGame(client, tableName2, userId, metaGame, gameId) {
  await Promise.all([
    client.send(new DeleteCommand3({
      TableName: tableName2,
      Key: {
        pk: `REPRESENTATIVE#${metaGame}`,
        sk: representativeMetaSk(userId, gameId)
      }
    })),
    client.send(new DeleteCommand3({
      TableName: tableName2,
      Key: {
        pk: `PLAYER#${userId}`,
        sk: representativeUserSk(metaGame, gameId)
      }
    }))
  ]);
  return { ok: true };
}
async function listUserRecommendations(client, tableName2, userId) {
  const items = await queryAllItems(client, {
    TableName: tableName2,
    KeyConditionExpression: "#pk = :pk AND begins_with(#sk, :prefix)",
    ExpressionAttributeNames: { "#pk": "pk", "#sk": "sk" },
    ExpressionAttributeValues: {
      ":pk": `PLAYER#${userId}`,
      ":prefix": "REPRESENTATIVE#"
    }
  });
  return items.map((item) => {
    const sk = item.sk;
    const parts = sk.split("#");
    const meta = parts[1] ?? "";
    const entry = item;
    if (!entry.userId) {
      entry.userId = userId;
    }
    if (!entry.metaGame && meta) {
      entry.metaGame = meta;
    }
    return entry;
  }).sort((a, b) => (a.addedAt ?? 0) - (b.addedAt ?? 0));
}
async function listMetaGameRecommendations(client, tableName2, metaGame) {
  const items = await queryAllItems(client, {
    TableName: tableName2,
    KeyConditionExpression: "#pk = :pk",
    ExpressionAttributeNames: { "#pk": "pk" },
    ExpressionAttributeValues: { ":pk": `REPRESENTATIVE#${metaGame}` }
  });
  return items.map((item) => item).sort((a, b) => (a.addedAt ?? 0) - (b.addedAt ?? 0));
}
async function countGameWatchers(client, tableName2, gameId) {
  let count = 0;
  let lastKey;
  do {
    const result = await client.send(new QueryCommand2({
      TableName: tableName2,
      KeyConditionExpression: "#pk = :pk",
      ExpressionAttributeNames: { "#pk": "pk" },
      ExpressionAttributeValues: { ":pk": `GAMEWATCHERS#${gameId}` },
      Select: "COUNT",
      ExclusiveStartKey: lastKey
    }));
    count += result.Count ?? 0;
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);
  return count;
}
async function updateWatcherSummaries(client, tableName2, gameId, summary) {
  const watchers = await queryAllItems(client, {
    TableName: tableName2,
    KeyConditionExpression: "#pk = :pk",
    ExpressionAttributeNames: { "#pk": "pk" },
    ExpressionAttributeValues: { ":pk": `GAMEWATCHERS#${gameId}` },
    ProjectionExpression: "sk"
  });
  if (watchers.length === 0) {
    return;
  }
  const updates = watchers.map(async (watcher) => {
    const watcherId = watcher.sk;
    const existing = await client.send(new GetCommand3({
      TableName: tableName2,
      Key: { pk: `WATCHED#${watcherId}`, sk: gameId }
    }));
    const prev = existing.Item ?? {};
    await client.send(new PutCommand2({
      TableName: tableName2,
      Item: {
        pk: `WATCHED#${watcherId}`,
        sk: gameId,
        ...summary,
        addedAt: prev.addedAt ?? Date.now(),
        seen: prev.seen,
        lastChat: prev.lastChat
      }
    }));
  });
  await Promise.all(updates);
}
async function updateLastChatForWatchers(client, tableName2, gameId, currentUserId) {
  const watchers = await queryAllItems(client, {
    TableName: tableName2,
    KeyConditionExpression: "#pk = :pk",
    ExpressionAttributeNames: { "#pk": "pk" },
    ExpressionAttributeValues: { ":pk": `GAMEWATCHERS#${gameId}` },
    ProjectionExpression: "sk"
  });
  if (watchers.length === 0) {
    return;
  }
  const now = Date.now();
  const updates = watchers.map((watcher) => {
    const watcherId = watcher.sk;
    const isCommenter = watcherId === currentUserId;
    if (isCommenter) {
      return client.send(new UpdateCommand3({
        TableName: tableName2,
        Key: { pk: `WATCHED#${watcherId}`, sk: gameId },
        UpdateExpression: "SET lastChat = :lc, seen = :seen",
        ExpressionAttributeValues: {
          ":lc": now,
          ":seen": now + 10
        }
      }));
    }
    return client.send(new UpdateCommand3({
      TableName: tableName2,
      Key: { pk: `WATCHED#${watcherId}`, sk: gameId },
      UpdateExpression: "SET lastChat = :lc",
      ExpressionAttributeValues: { ":lc": now }
    }));
  });
  await Promise.all(updates);
}
async function setWatchedSeen(client, tableName2, userId, gameId, seen, lastChat) {
  const watched = await client.send(new GetCommand3({
    TableName: tableName2,
    Key: { pk: `WATCHED#${userId}`, sk: gameId }
  }));
  if (watched.Item === void 0) {
    return false;
  }
  const values = { ":seen": seen };
  let updateExpression = "SET seen = :seen";
  if (lastChat !== void 0) {
    values[":lc"] = lastChat;
    updateExpression += ", lastChat = :lc";
  }
  await client.send(new UpdateCommand3({
    TableName: tableName2,
    Key: { pk: `WATCHED#${userId}`, sk: gameId },
    UpdateExpression: updateExpression,
    ExpressionAttributeValues: values
  }));
  return true;
}
var MAX_RECOMMENDATIONS_PER_METAGAME;
var init_playerGameMarks = __esm({
  "lib/playerGameMarks.ts"() {
    "use strict";
    init_commentAuth();
    init_gameState();
    init_gameProjector();
    MAX_RECOMMENDATIONS_PER_METAGAME = 2;
  }
});

// lib/botSigning.ts
var init_botSigning = __esm({
  "lib/botSigning.ts"() {
    "use strict";
  }
});

// lib/botOutbound.ts
import { GetCommand as GetCommand4, UpdateCommand as UpdateCommand4 } from "@aws-sdk/lib-dynamodb";
import { SQSClient as SQSClient2, SendMessageCommand as SendMessageCommand2 } from "@aws-sdk/client-sqs";
import { GameFactory as GameFactory3 } from "@abstractplay/gameslib";
async function enqueueBotOutbound(message) {
  const queueUrl = process.env.BOT_OUTBOUND_QUEUE_URL;
  if (!queueUrl) {
    throw new Error("BOT_OUTBOUND_QUEUE_URL environment variable is not set");
  }
  await sqsClient2.send(
    new SendMessageCommand2({
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify(message)
    })
  );
}
function getToMovePlayerIds(game2, simultaneous) {
  const ids = [];
  if (game2.toMove === "" || game2.toMove === null || game2.toMove === void 0) {
    return ids;
  }
  if (simultaneous) {
    const toMove = game2.toMove;
    for (let i = 0; i < toMove.length; i++) {
      if (toMove[i]) {
        ids.push(game2.players[i].id);
      }
    }
  } else {
    ids.push(game2.players[parseInt(game2.toMove, 10)].id);
  }
  return ids;
}
async function loadGameRecord(metaGame, gameid) {
  const data = await ddbDocClient.send(
    new GetCommand4({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: {
        pk: "GAME",
        sk: `${metaGame}#0#${gameid}`
      }
    })
  );
  const item = data.Item;
  return item !== void 0 ? hydrateGameState(item) : void 0;
}
var REGION3, sqsClient2;
var init_botOutbound = __esm({
  "lib/botOutbound.ts"() {
    "use strict";
    init_ddb();
    init_gameState();
    init_botSigning();
    init_participants();
    REGION3 = "us-east-1";
    sqsClient2 = new SQSClient2({ region: REGION3 });
  }
});

// lib/botSecrets.ts
import {
  CognitoIdentityProviderClient,
  AddUserPoolClientSecretCommand,
  ListUserPoolClientSecretsCommand,
  DeleteUserPoolClientSecretCommand
} from "@aws-sdk/client-cognito-identity-provider";
function getUserPoolId() {
  const userPoolId = process.env.BOTPOOL_ID;
  if (!userPoolId) {
    throw new Error("BOTPOOL_ID environment variable is not set");
  }
  return userPoolId;
}
function sortSecretsByCreateDate(secrets) {
  return [...secrets].sort((a, b) => {
    const aTime = a.ClientSecretCreateDate?.getTime() ?? 0;
    const bTime = b.ClientSecretCreateDate?.getTime() ?? 0;
    return aTime - bTime;
  });
}
async function listBotClientSecrets(clientId) {
  const response = await cognitoClient.send(new ListUserPoolClientSecretsCommand({
    UserPoolId: getUserPoolId(),
    ClientId: clientId
  }));
  return sortSecretsByCreateDate(response.ClientSecrets ?? []);
}
async function beginBotSecretRotation(clientId) {
  const secrets = await listBotClientSecrets(clientId);
  if (secrets.length === 0) {
    throw new Error("No client secrets found");
  }
  if (secrets.length === 2) {
    const newest = secrets[1];
    if (!newest.ClientSecretId) {
      throw new Error("Pending client secret is missing an identifier");
    }
    await cognitoClient.send(new DeleteUserPoolClientSecretCommand({
      UserPoolId: getUserPoolId(),
      ClientId: clientId,
      ClientSecretId: newest.ClientSecretId
    }));
  }
  const response = await cognitoClient.send(new AddUserPoolClientSecretCommand({
    UserPoolId: getUserPoolId(),
    ClientId: clientId
  }));
  const descriptor = response.ClientSecretDescriptor;
  if (!descriptor?.ClientSecretId || !descriptor.ClientSecretValue) {
    throw new Error("Cognito did not return ClientSecretId or ClientSecret");
  }
  return {
    clientSecretId: descriptor.ClientSecretId,
    clientSecret: descriptor.ClientSecretValue
  };
}
async function finalizeBotSecretRotation(clientId) {
  const secrets = await listBotClientSecrets(clientId);
  if (secrets.length !== 2) {
    throw new Error("No secret rotation in progress");
  }
  const oldest = secrets[0];
  if (!oldest.ClientSecretId) {
    throw new Error("Oldest client secret is missing an identifier");
  }
  await cognitoClient.send(new DeleteUserPoolClientSecretCommand({
    UserPoolId: getUserPoolId(),
    ClientId: clientId,
    ClientSecretId: oldest.ClientSecretId
  }));
}
var REGION4, cognitoClient;
var init_botSecrets = __esm({
  "lib/botSecrets.ts"() {
    "use strict";
    REGION4 = "us-east-1";
    cognitoClient = new CognitoIdentityProviderClient({ region: REGION4 });
  }
});

// lib/botCognito.ts
function getBotOAuthScope() {
  const scope = process.env.BOT_OAUTH_SCOPE?.trim();
  if (!scope) {
    throw new Error("BOT_OAUTH_SCOPE environment variable is not set");
  }
  return scope;
}
function buildCreateBotClientInput(userPoolId, cognitoClientName) {
  return {
    UserPoolId: userPoolId,
    ClientName: cognitoClientName,
    GenerateSecret: true,
    AllowedOAuthFlows: ["client_credentials"],
    AllowedOAuthFlowsUserPoolClient: true,
    AllowedOAuthScopes: [getBotOAuthScope()],
    PreventUserExistenceErrors: "ENABLED"
  };
}
var init_botCognito = __esm({
  "lib/botCognito.ts"() {
    "use strict";
  }
});

// lib/botNames.ts
import { DeleteCommand as DeleteCommand4, GetCommand as GetCommand5, PutCommand as PutCommand3 } from "@aws-sdk/lib-dynamodb";
function normalizeBotDisplayName(name) {
  return name.trim().toLowerCase();
}
function validateBotDisplayName(name) {
  const displayName = name.trim();
  if (displayName.length === 0) {
    throw new BotNameValidationError("A name is required for the bot");
  }
  if (displayName.length > MAX_BOT_DISPLAY_NAME_LENGTH) {
    throw new BotNameValidationError(`Bot name must be at most ${MAX_BOT_DISPLAY_NAME_LENGTH} characters`);
  }
  return displayName;
}
function getTableName() {
  const tableName2 = process.env.ABSTRACT_PLAY_TABLE;
  if (!tableName2) {
    throw new Error("ABSTRACT_PLAY_TABLE environment variable is not set");
  }
  return tableName2;
}
async function reserveBotDisplayName(name, clientId, owner) {
  const displayName = validateBotDisplayName(name);
  const tableName2 = getTableName();
  const normalizedName = normalizeBotDisplayName(displayName);
  try {
    await ddbDocClient.send(
      new PutCommand3({
        TableName: tableName2,
        Item: {
          pk: BOTNAME_PK,
          sk: normalizedName,
          clientId,
          owner,
          displayName
        },
        ConditionExpression: "attribute_not_exists(pk)"
      })
    );
  } catch (error2) {
    const err = error2;
    if (err.name === "ConditionalCheckFailedException") {
      throw new BotNameTakenError();
    }
    throw error2;
  }
  return displayName;
}
async function releaseBotDisplayName(name) {
  const normalizedName = normalizeBotDisplayName(name);
  if (!normalizedName) {
    return;
  }
  await ddbDocClient.send(
    new DeleteCommand4({
      TableName: getTableName(),
      Key: { pk: BOTNAME_PK, sk: normalizedName }
    })
  );
}
async function renameBotDisplayName(oldName, newName, clientId, owner) {
  const displayName = validateBotDisplayName(newName);
  const oldNormalized = normalizeBotDisplayName(oldName);
  const newNormalized = normalizeBotDisplayName(displayName);
  if (oldNormalized === newNormalized) {
    return displayName;
  }
  await reserveBotDisplayName(displayName, clientId, owner);
  try {
    await releaseBotDisplayName(oldName);
  } catch (error2) {
    await releaseBotDisplayName(displayName);
    throw error2;
  }
  return displayName;
}
var BOTNAME_PK, MAX_BOT_DISPLAY_NAME_LENGTH, BotNameTakenError, BotNameValidationError;
var init_botNames = __esm({
  "lib/botNames.ts"() {
    "use strict";
    init_ddb();
    BOTNAME_PK = "BOTNAME";
    MAX_BOT_DISPLAY_NAME_LENGTH = 64;
    BotNameTakenError = class extends Error {
      constructor(message = "That bot name is already in use") {
        super(message);
        this.name = "BotNameTakenError";
      }
    };
    BotNameValidationError = class extends Error {
      constructor(message) {
        super(message);
        this.name = "BotNameValidationError";
      }
    };
  }
});

// lib/botVerify.ts
var MAX_SIGNATURE_AGE_SEC;
var init_botVerify = __esm({
  "lib/botVerify.ts"() {
    "use strict";
    MAX_SIGNATURE_AGE_SEC = 5 * 60;
  }
});

// lib/botClientLog.ts
var init_botClientLog = __esm({
  "lib/botClientLog.ts"() {
    "use strict";
  }
});

// lib/botClient.ts
var init_botClient = __esm({
  "lib/botClient.ts"() {
    "use strict";
    init_botClientLog();
  }
});

// api/testBot.ts
import { GetCommand as GetCommand6, PutCommand as PutCommand4, UpdateCommand as UpdateCommand5 } from "@aws-sdk/lib-dynamodb";
import { GameFactory as GameFactory4 } from "@abstractplay/gameslib";
function defaultTestBotState() {
  return {
    pk: TEST_BOT_PK,
    sk: TEST_BOT_SK,
    owner: TEST_BOT_OWNER_ID,
    settings: { ...DEFAULT_TEST_BOT_SETTINGS, rejectMetaGames: [] },
    recentEvents: []
  };
}
async function getOrCreateTestBotState() {
  const tableName2 = process.env.ABSTRACT_PLAY_TABLE;
  if (!tableName2) {
    throw new Error("ABSTRACT_PLAY_TABLE environment variable is not set");
  }
  const data = await ddbDocClient.send(
    new GetCommand6({
      TableName: tableName2,
      Key: { pk: TEST_BOT_PK, sk: TEST_BOT_SK }
    })
  );
  if (data.Item) {
    return data.Item;
  }
  const item = defaultTestBotState();
  try {
    await ddbDocClient.send(
      new PutCommand4({
        TableName: tableName2,
        Item: item,
        ConditionExpression: "attribute_not_exists(pk)"
      })
    );
  } catch (error2) {
    const err = error2;
    if (err.name !== "ConditionalCheckFailedException") {
      throw error2;
    }
    const retry = await ddbDocClient.send(
      new GetCommand6({
        TableName: tableName2,
        Key: { pk: TEST_BOT_PK, sk: TEST_BOT_SK }
      })
    );
    if (!retry.Item) {
      throw error2;
    }
    return retry.Item;
  }
  return item;
}
async function updateTestBotSettings(patch) {
  const tableName2 = process.env.ABSTRACT_PLAY_TABLE;
  if (!tableName2) {
    throw new Error("ABSTRACT_PLAY_TABLE environment variable is not set");
  }
  const state = await getOrCreateTestBotState();
  const settings = {
    ...state.settings,
    ...patch,
    rejectMetaGames: patch.rejectMetaGames ?? state.settings.rejectMetaGames ?? []
  };
  await ddbDocClient.send(
    new UpdateCommand5({
      TableName: tableName2,
      Key: { pk: TEST_BOT_PK, sk: TEST_BOT_SK },
      ExpressionAttributeValues: { ":settings": settings },
      UpdateExpression: "SET settings = :settings"
    })
  );
  return settings;
}
function isTestBotOwner(userId) {
  return userId === TEST_BOT_OWNER_ID;
}
function dashboardForbidden() {
  return {
    statusCode: 403,
    body: JSON.stringify({ message: "You are not authorized to access the test bot dashboard" }),
    headers: dashboardHeaders
  };
}
function dashboardError(message) {
  return {
    statusCode: 500,
    body: JSON.stringify({ message }),
    headers: dashboardHeaders
  };
}
async function testBotStatus(claim) {
  if (!isTestBotOwner(claim?.sub)) {
    return dashboardForbidden();
  }
  try {
    const state = await getOrCreateTestBotState();
    const clientId = process.env.TEST_BOT_CLIENT_ID?.trim();
    const apiBase = process.env.API_BASE_URL?.replace(/\/$/, "");
    const endpointUrl = apiBase ? `${apiBase}/testBot` : void 0;
    let botRecord;
    if (clientId) {
      const bot = await getBotRecord(clientId);
      if (bot) {
        botRecord = {
          lastseen: bot.lastseen,
          operational: bot.operational,
          lastStatusCode: bot.lastStatusCode,
          name: bot.name,
          endpoint: bot.endpoint
        };
      }
    }
    return {
      statusCode: 200,
      body: JSON.stringify({
        endpointUrl,
        clientIdConfigured: Boolean(clientId),
        clientId: clientId ?? null,
        settings: state.settings,
        recentEvents: state.recentEvents ?? [],
        botRecord: botRecord ?? null
      }),
      headers: dashboardHeaders
    };
  } catch (error2) {
    const message = error2 instanceof Error ? error2.message : String(error2);
    console.error("Error loading test bot status:", error2);
    return dashboardError(`Unable to load test bot status: ${message}`);
  }
}
async function updateTestBot(claim, pars) {
  if (!isTestBotOwner(claim?.sub)) {
    return dashboardForbidden();
  }
  const patch = {};
  if (pars.acceptChallenges !== void 0) {
    patch.acceptChallenges = pars.acceptChallenges;
  }
  if (pars.rejectMetaGames !== void 0) {
    patch.rejectMetaGames = pars.rejectMetaGames;
  }
  if (pars.movePolicy !== void 0) {
    if (pars.movePolicy !== "pass" && pars.movePolicy !== "firstLegal") {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: "movePolicy must be 'pass' or 'firstLegal'" }),
        headers: dashboardHeaders
      };
    }
    patch.movePolicy = pars.movePolicy;
  }
  if (pars.moveDelayMs !== void 0) {
    if (!Number.isFinite(pars.moveDelayMs) || pars.moveDelayMs < 0) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: "moveDelayMs must be a non-negative number" }),
        headers: dashboardHeaders
      };
    }
    patch.moveDelayMs = Math.floor(pars.moveDelayMs);
  }
  if (Object.keys(patch).length === 0) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: "No test bot settings were provided" }),
      headers: dashboardHeaders
    };
  }
  try {
    const settings = await updateTestBotSettings(patch);
    return {
      statusCode: 200,
      body: JSON.stringify({ settings }),
      headers: dashboardHeaders
    };
  } catch (error2) {
    const message = error2 instanceof Error ? error2.message : String(error2);
    console.error("Error updating test bot settings:", error2);
    return dashboardError(`Unable to update test bot settings: ${message}`);
  }
}
var TEST_BOT_OWNER_ID, TEST_BOT_PK, TEST_BOT_SK, DEFAULT_TEST_BOT_SETTINGS, dashboardHeaders;
var init_testBot = __esm({
  "api/testBot.ts"() {
    "use strict";
    init_botVerify();
    init_botClient();
    init_participants();
    init_ddb();
    TEST_BOT_OWNER_ID = "3ccb3a1f-3d25-441e-9efc-e526eac4fe9a";
    TEST_BOT_PK = "TESTBOT";
    TEST_BOT_SK = "dev";
    DEFAULT_TEST_BOT_SETTINGS = {
      acceptChallenges: true,
      rejectMetaGames: [],
      movePolicy: "firstLegal",
      moveDelayMs: 0
    };
    dashboardHeaders = {
      "content-type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Credentials": true,
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Allow-Methods": "*"
    };
  }
});

// lib/adminDeleteGame.ts
import {
  BatchWriteCommand as BatchWriteCommand2,
  DeleteCommand as DeleteCommand5,
  GetCommand as GetCommand7,
  QueryCommand as QueryCommand3
} from "@aws-sdk/lib-dynamodb";
async function humanPlayerIds(client, tableName2, players) {
  const ids = [];
  for (const player of players) {
    const bot = await client.send(new GetCommand7({
      TableName: tableName2,
      Key: { pk: "BOT", sk: player.id }
    }));
    if (bot.Item === void 0) {
      ids.push(player.id);
    }
  }
  return ids;
}
async function queryAllItems2(client, params2) {
  const items = [];
  let lastKey;
  do {
    const result = await client.send(new QueryCommand3({
      ...params2,
      ExclusiveStartKey: lastKey
    }));
    if (result.Items) {
      items.push(...result.Items);
    }
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);
  return items;
}
function toGameRecord(game2, cbit) {
  return {
    pk: "GAME",
    sk: `${game2.metaGame}#${cbit}#${game2.id}`,
    id: game2.id,
    metaGame: game2.metaGame,
    numPlayers: game2.numPlayers,
    players: game2.players.map((player) => ({
      id: player.id,
      name: "name" in player && typeof player.name === "string" ? player.name : player.id
    })),
    clockHard: game2.clockHard,
    toMove: game2.toMove,
    lastMoveTime: game2.lastMoveTime,
    state: game2.state,
    numMoves: game2.numMoves,
    gameEnded: game2.gameEnded,
    winner: game2.winner,
    commented: game2.commented,
    variants: game2.variants,
    noExplore: game2.noExplore,
    gameStarted: game2.gameStarted
  };
}
async function purgeWatchers(client, tableName2, gameId) {
  const watchers = await queryAllItems2(client, {
    TableName: tableName2,
    KeyConditionExpression: "#pk = :pk",
    ExpressionAttributeNames: { "#pk": "pk" },
    ExpressionAttributeValues: { ":pk": `GAMEWATCHERS#${gameId}` },
    ProjectionExpression: "sk"
  });
  await Promise.all(watchers.map(
    (watcher) => unwatchGame(client, tableName2, watcher.sk, gameId)
  ));
}
async function purgeHighlights(client, tableName2, metaGame, gameId, playerIds) {
  await Promise.all(playerIds.map(
    (playerId) => client.send(new DeleteCommand5({
      TableName: tableName2,
      Key: { pk: `HIGHLIGHT#${playerId}`, sk: `${metaGame}#${gameId}` }
    }))
  ));
}
async function purgeRepresentatives(client, tableName2, metaGame, gameId) {
  const suffix = `#${gameId}`;
  const representatives = await queryAllItems2(client, {
    TableName: tableName2,
    KeyConditionExpression: "#pk = :pk",
    ExpressionAttributeNames: { "#pk": "pk" },
    ExpressionAttributeValues: { ":pk": `REPRESENTATIVE#${metaGame}` },
    ProjectionExpression: "sk"
  });
  const matches = representatives.filter(
    (item) => typeof item.sk === "string" && item.sk.endsWith(suffix)
  );
  await Promise.all(matches.map((item) => {
    const sk = item.sk;
    const userId = sk.slice(0, -suffix.length);
    return Promise.all([
      client.send(new DeleteCommand5({
        TableName: tableName2,
        Key: { pk: `REPRESENTATIVE#${metaGame}`, sk }
      })),
      client.send(new DeleteCommand5({
        TableName: tableName2,
        Key: { pk: `PLAYER#${userId}`, sk: `REPRESENTATIVE#${metaGame}#${gameId}` }
      }))
    ]);
  }));
}
async function deleteExplorations(client, tableName2, gameId, cbit) {
  const queries = [
    client.send(new QueryCommand3({
      TableName: tableName2,
      KeyConditionExpression: "#pk = :pk",
      ExpressionAttributeNames: { "#pk": "pk" },
      ExpressionAttributeValues: { ":pk": `GAMEEXPLORATION#${gameId}` }
    }))
  ];
  if (cbit === 1) {
    queries.push(client.send(new QueryCommand3({
      TableName: tableName2,
      KeyConditionExpression: "#pk = :pk",
      ExpressionAttributeNames: { "#pk": "pk" },
      ExpressionAttributeValues: { ":pk": `PUBLICEXPLORATION#${gameId}` }
    })));
  }
  const results = await Promise.all(queries);
  const items = results.flatMap((result) => result.Items ?? []);
  for (let i = 0; i < items.length; i += 25) {
    const chunk = items.slice(i, i + 25);
    if (chunk.length === 0) {
      continue;
    }
    await client.send(new BatchWriteCommand2({
      RequestItems: {
        [tableName2]: chunk.map((item) => ({
          DeleteRequest: {
            Key: { pk: item.pk, sk: item.sk }
          }
        }))
      }
    }));
  }
}
async function loadGameForAdminDelete(client, tableName2, metaGame, gameId, preferredCbit) {
  const trimmedId = gameId.trim();
  const order = preferredCbit === 0 ? [0, 1] : [1, 0];
  for (const cbit of order) {
    const data = await client.send(new GetCommand7({
      TableName: tableName2,
      Key: { pk: "GAME", sk: `${metaGame}#${cbit}#${trimmedId}` }
    }));
    if (data.Item !== void 0) {
      return { game: data.Item, cbit };
    }
  }
  return void 0;
}
async function adminDeleteGame(client, tableName2, metaGame, gameId, preferredCbit) {
  const loaded = await loadGameForAdminDelete(client, tableName2, metaGame, gameId, preferredCbit);
  if (loaded === void 0) {
    return {
      gameId: gameId.trim(),
      metaGame,
      cbit: preferredCbit,
      deleted: [],
      notFound: true
    };
  }
  const { game: game2, cbit } = loaded;
  const deleted = [];
  const playerIds = await humanPlayerIds(client, tableName2, game2.players);
  const gameRecord = toGameRecord(game2, cbit);
  await purgeWatchers(client, tableName2, game2.id);
  deleted.push("watchers");
  await purgeHighlights(client, tableName2, metaGame, game2.id, playerIds);
  deleted.push("highlights");
  await purgeRepresentatives(client, tableName2, metaGame, game2.id);
  deleted.push("representatives");
  if (cbit === 0) {
    await purgeActiveGameDashboardIndexes(client, tableName2, gameRecord, playerIds);
    deleted.push("currentgames", "usergame-overlays", "meta-counts");
  } else {
    await purgeCompletedGameDashboardIndexes(client, tableName2, gameRecord, playerIds);
    deleted.push("completedgames-index", "recentcompleted", "usergame-overlays");
  }
  await Promise.all(game2.players.map(
    (player) => client.send(new DeleteCommand5({
      TableName: tableName2,
      Key: { pk: "NOTE", sk: `${game2.id}#${player.id}` }
    }))
  ));
  deleted.push("notes");
  await client.send(new DeleteCommand5({
    TableName: tableName2,
    Key: { pk: "GAMECOMMENTS", sk: game2.id }
  }));
  deleted.push("comments");
  await deleteExplorations(client, tableName2, game2.id, cbit);
  deleted.push("explorations");
  await client.send(new DeleteCommand5({
    TableName: tableName2,
    Key: { pk: "GAME", sk: `${metaGame}#${cbit}#${game2.id}` }
  }));
  deleted.push("game");
  return { gameId: game2.id, metaGame, cbit, deleted };
}
var init_adminDeleteGame = __esm({
  "lib/adminDeleteGame.ts"() {
    "use strict";
    init_gameProjector();
    init_playerGameMarks();
  }
});

// lib/explorationMoves.ts
import { GameFactory as GameFactory5 } from "@abstractplay/gameslib";
function assertValidMoveHasComplete(v, move) {
  if (v.valid && v.complete == null) {
    throw new Error(`validateMove returned valid without complete for move: ${move}`);
  }
}
function createProbeEngine(gameEngine, metaGame) {
  const engine = gameEngine;
  if (metaGame && typeof engine.cheapSerialize === "function") {
    return GameFactory5(metaGame, engine.cheapSerialize());
  }
  if (typeof gameEngine.clone === "function") {
    const probe = gameEngine.clone();
    probe.load(-1);
    return probe;
  }
  throw new Error(`Cannot probe move without metaGame or clone(): ${metaGame}`);
}
function requiresPartialExplorationApply(gameEngine, move, metaGame) {
  const v = gameEngine.validateMove(move);
  if (!v.valid)
    return false;
  assertValidMoveHasComplete(v, move);
  if (v.complete === 1)
    return false;
  try {
    createProbeEngine(gameEngine, metaGame).move(move, {
      trusted: true,
      partial: false,
      emulation: true
    });
    return false;
  } catch {
    return true;
  }
}
function validateExplorationMove(gameEngine, move, metaGame) {
  const v = gameEngine.validateMove(move);
  if (!v.valid)
    return { valid: false, partial: false };
  assertValidMoveHasComplete(v, move);
  return {
    valid: true,
    partial: requiresPartialExplorationApply(gameEngine, move, metaGame)
  };
}
function isPersistableExplorationMove(gameEngine, move, metaGame) {
  const { valid, partial } = validateExplorationMove(gameEngine, move, metaGame);
  return valid && !partial;
}
function applyExplorationMove(gameEngine, move, { emulation = false, metaGame } = { metaGame: "" }) {
  const { valid, partial } = validateExplorationMove(gameEngine, move, metaGame);
  if (!valid) {
    throw new Error(`Invalid exploration move: ${move}`);
  }
  gameEngine.move(move, { trusted: true, partial, emulation });
}
function filterPersistableExplorationTree(gameEngine, children, metaGame) {
  if (!Array.isArray(children))
    return [];
  const result = [];
  for (const child of children) {
    if (!child?.move)
      continue;
    if (!isPersistableExplorationMove(gameEngine, child.move, metaGame))
      continue;
    try {
      applyExplorationMove(gameEngine, child.move, { metaGame });
      result.push({
        ...child,
        children: filterPersistableExplorationTree(
          gameEngine,
          child.children || [],
          metaGame
        )
      });
      gameEngine.stack.pop();
      gameEngine.load(-1);
      gameEngine.gameover = false;
      gameEngine.winner = [];
    } catch (err) {
      console.warn(`Skipping unpersistable exploration branch: ${child.move}`, err);
    }
  }
  return result;
}
function engineAtMove(metaGame, gameState, move) {
  const engine = GameFactory5(metaGame, gameState);
  if (!engine) {
    throw new Error(`Unknown metaGame ${metaGame}`);
  }
  if (move + 1 < engine.stack.length) {
    engine.gameover = false;
    engine.winner = [];
  }
  engine.stack = engine.stack.slice(0, move);
  engine.load(-1);
  return engine;
}
function filterExplorationTreeForSave(metaGame, gameState, move, tree, isPublic) {
  const engine = engineAtMove(metaGame, gameState, move);
  if (isPublic && !Array.isArray(tree)) {
    return {
      ...tree,
      children: filterPersistableExplorationTree(engine, tree.children || [], metaGame)
    };
  }
  const children = Array.isArray(tree) ? tree : tree.children || [];
  return filterPersistableExplorationTree(engine, children, metaGame);
}
var init_explorationMoves = __esm({
  "lib/explorationMoves.ts"() {
    "use strict";
  }
});

// lib/soloGame.ts
import { gameinfo, GameFactory as GameFactory6 } from "@abstractplay/gameslib";
var soloPlaySupported, resolveChallengeSeed, createSoloEngine, DEFAULT_SOLO_CLOCK, normalizeSoloClocks, buildStartSoloGame;
var init_soloGame = __esm({
  "lib/soloGame.ts"() {
    "use strict";
    init_esm_node();
    soloPlaySupported = (metaGame) => {
      const info = gameinfo.get(metaGame);
      return info !== void 0 && info.playercounts.includes(1);
    };
    resolveChallengeSeed = (provided) => {
      if (provided !== void 0 && provided.trim().length > 0) {
        return provided.trim();
      }
      return v4_default();
    };
    createSoloEngine = (metaGame, variants, challengeSeed) => {
      const info = gameinfo.get(metaGame);
      if (info === void 0) {
        throw new Error(`Unknown metaGame ${metaGame}`);
      }
      if (!info.playercounts.includes(1)) {
        throw new Error(`Game ${metaGame} does not support solo play`);
      }
      let engine;
      if (info.playercounts.length > 1) {
        engine = GameFactory6(metaGame, 1, variants);
      } else {
        engine = GameFactory6(metaGame, void 0, variants);
      }
      if (engine === void 0) {
        throw new Error(`Could not instantiate ${metaGame}`);
      }
      const soloEngine = engine;
      if (typeof soloEngine.initRng === "function") {
        soloEngine.initRng(challengeSeed);
      }
      return engine;
    };
    DEFAULT_SOLO_CLOCK = {
      clockStart: 72,
      clockInc: 0,
      clockMax: 72,
      clockHard: false
    };
    normalizeSoloClocks = (opts = {}) => ({
      clockStart: opts.clockStart ?? DEFAULT_SOLO_CLOCK.clockStart,
      clockInc: opts.clockInc ?? DEFAULT_SOLO_CLOCK.clockInc,
      clockMax: opts.clockMax ?? DEFAULT_SOLO_CLOCK.clockMax,
      clockHard: opts.clockHard ?? DEFAULT_SOLO_CLOCK.clockHard
    });
    buildStartSoloGame = (input) => {
      const challengeSeed = resolveChallengeSeed(input.challengeSeed);
      const engine = createSoloEngine(input.metaGame, input.variants, challengeSeed);
      return {
        gameId: v4_default(),
        metaGame: input.metaGame,
        challengeSeed,
        state: engine.serialize(),
        variants: engine.variants,
        engine
      };
    };
  }
});

// lib/tournamentGame.ts
import { gameinfo as gameinfo2 } from "@abstractplay/gameslib";
var tournamentPlaySupported;
var init_tournamentGame = __esm({
  "lib/tournamentGame.ts"() {
    "use strict";
    tournamentPlaySupported = (metaGame) => {
      const info = gameinfo2.get(metaGame);
      return info !== void 0 && info.playercounts.includes(2);
    };
  }
});

// lib/dashboardGames.ts
import {
  GetCommand as GetCommand8,
  QueryCommand as QueryCommand4
} from "@aws-sdk/lib-dynamodb";
function isActiveDashboardGame(game2) {
  return game2.toMove !== "" && game2.toMove !== null && game2.toMove !== void 0;
}
function currentRowToGame(row) {
  const game2 = {
    id: row.id ?? row.sk,
    metaGame: row.metaGame,
    players: row.players,
    clockHard: row.clockHard,
    noExplore: row.noExplore ?? false,
    toMove: row.toMove,
    lastMoveTime: row.lastMoveTime,
    variants: row.variants,
    gameStarted: row.gameStarted
  };
  if (row.numMoves !== void 0) {
    game2.numMoves = row.numMoves;
  }
  return game2;
}
async function listCurrentGameRows(client, tableName2, userId) {
  const items = [];
  let lastEvaluatedKey;
  do {
    const page = await client.send(new QueryCommand4({
      TableName: tableName2,
      KeyConditionExpression: "#pk = :pk",
      ExpressionAttributeNames: { "#pk": "pk" },
      ExpressionAttributeValues: { ":pk": `CURRENTGAMES#${userId}` },
      ExclusiveStartKey: lastEvaluatedKey
    }));
    for (const item of page.Items ?? []) {
      items.push(item);
    }
    lastEvaluatedKey = page.LastEvaluatedKey;
  } while (lastEvaluatedKey);
  return items;
}
async function hasCurrentGameRow(client, tableName2, userId, gameId) {
  const data = await client.send(new GetCommand8({
    TableName: tableName2,
    Key: { pk: `CURRENTGAMES#${userId}`, sk: gameId },
    ProjectionExpression: "#pk",
    ExpressionAttributeNames: { "#pk": "pk" }
  }));
  return data.Item !== void 0;
}
function mergeDashboardGames(currentRows, overlays) {
  return currentRows.map((row) => {
    const game2 = currentRowToGame(row);
    return applyOverlayFields(game2, overlays.get(game2.id));
  });
}
async function shouldWriteGameOpenOverlay(client, tableName2, userId, gameId) {
  return hasCurrentGameRow(client, tableName2, userId, gameId);
}
async function loadDashboardGameData(client, tableName2, userId) {
  const [currentRows, overlays] = await Promise.all([
    listCurrentGameRows(client, tableName2, userId),
    listUserGameOverlays(client, tableName2, userId)
  ]);
  const games2 = mergeDashboardGames(currentRows, overlays);
  return { games: games2, currentRows };
}
async function listActiveGameKeys(client, tableName2, userId) {
  const rows = await listCurrentGameRows(client, tableName2, userId);
  return rows.filter((row) => isActiveDashboardGame(row)).map((row) => ({
    metaGame: row.metaGame,
    id: row.id ?? row.sk
  }));
}
async function loadDashboardGames(client, tableName2, userId) {
  const { games: games2 } = await loadDashboardGameData(client, tableName2, userId);
  return games2;
}
var init_dashboardGames = __esm({
  "lib/dashboardGames.ts"() {
    "use strict";
    init_userGameOverlay();
  }
});

// lib/gameTimeout.ts
import { UpdateCommand as UpdateCommand6 } from "@aws-sdk/lib-dynamodb";
function isConditionalFailure(err) {
  return typeof err === "object" && err !== null && "name" in err && err.name === "ConditionalCheckFailedException";
}
async function checkAndProcessGameTimeout(game2, deps) {
  const now = deps.now?.() ?? Date.now();
  const log2 = deps.log ?? (() => {
  });
  if (!game2.clockHard || !game2.toMove || game2.toMove === "") {
    return { processed: false, game: game2 };
  }
  if (Array.isArray(game2.toMove)) {
    let minTime = 0;
    let minIndex = -1;
    const elapsed = now - game2.lastMoveTime;
    game2.toMove.forEach((p, i) => {
      if (p && game2.players[i].time - elapsed < minTime) {
        minTime = game2.players[i].time - elapsed;
        minIndex = i;
      }
    });
    if (minIndex === -1) {
      return { processed: false, game: game2 };
    }
    const newLastMoveTime2 = game2.lastMoveTime + game2.players[minIndex].time;
    const expectedToMove = [...game2.toMove];
    try {
      await deps.client.send(new UpdateCommand6({
        TableName: deps.tableName,
        Key: {
          pk: "GAME",
          sk: `${game2.metaGame}#0#${game2.id}`
        },
        ConditionExpression: "toMove = :expectedToMove",
        ExpressionAttributeValues: {
          ":expectedToMove": expectedToMove,
          ":newToMove": "",
          ":newLastMoveTime": newLastMoveTime2
        },
        UpdateExpression: "set toMove = :newToMove, lastMoveTime = :newLastMoveTime"
      }));
      log2(`Successfully marked simultaneous game ${game2.id} as timed out, processing...`);
      game2.toMove = "";
      game2.lastMoveTime = newLastMoveTime2;
      await deps.timeloss(false, minIndex, game2.id, game2.metaGame, game2.lastMoveTime);
      return { processed: true, game: game2 };
    } catch (err) {
      if (isConditionalFailure(err)) {
        log2(`Simultaneous game ${game2.id} already processed, skipping`);
        game2.toMove = "";
        game2.lastMoveTime = newLastMoveTime2;
        return { processed: false, game: game2 };
      }
      throw err;
    }
  }
  const toMove = parseInt(String(game2.toMove), 10);
  if (game2.players[toMove].time - (now - game2.lastMoveTime) >= 0) {
    return { processed: false, game: game2 };
  }
  const newLastMoveTime = game2.lastMoveTime + game2.players[toMove].time;
  try {
    await deps.client.send(new UpdateCommand6({
      TableName: deps.tableName,
      Key: {
        pk: "GAME",
        sk: `${game2.metaGame}#0#${game2.id}`
      },
      ConditionExpression: "toMove = :expectedToMove",
      ExpressionAttributeValues: {
        ":expectedToMove": toMove.toString(),
        ":newToMove": "",
        ":newLastMoveTime": newLastMoveTime
      },
      UpdateExpression: "set toMove = :newToMove, lastMoveTime = :newLastMoveTime"
    }));
    log2(`Successfully marked game ${game2.id} as timed out, processing...`);
    game2.lastMoveTime = newLastMoveTime;
    game2.toMove = "";
    await deps.timeloss(false, toMove, game2.id, game2.metaGame, game2.lastMoveTime);
    return { processed: true, game: game2 };
  } catch (err) {
    if (isConditionalFailure(err)) {
      log2(`Game ${game2.id} already processed by another request, skipping`);
      game2.toMove = "";
      game2.lastMoveTime = newLastMoveTime;
      return { processed: false, game: game2 };
    }
    throw err;
  }
}
async function sweepUserGameTimeouts(games2, deps) {
  const result = [];
  for (const game2 of games2) {
    const { game: updated } = await checkAndProcessGameTimeout(game2, deps);
    result.push(updated);
  }
  return result;
}
var init_gameTimeout = __esm({
  "lib/gameTimeout.ts"() {
    "use strict";
  }
});

// lib/dashboardMaintenance.ts
import { UpdateCommand as UpdateCommand7 } from "@aws-sdk/lib-dynamodb";
function isConditionalFailure2(err) {
  return typeof err === "object" && err !== null && "name" in err && err.name === "ConditionalCheckFailedException";
}
async function acquireDashboardMaintenanceLock(client, tableName2, userId, now = Date.now()) {
  const leaseExpiry = now - DASHBOARD_MAINTENANCE_LEASE_MS;
  try {
    await client.send(new UpdateCommand7({
      TableName: tableName2,
      Key: { pk: "USER", sk: userId },
      ConditionExpression: "attribute_not_exists(dashboardMaintAt) OR dashboardMaintAt < :leaseExpiry",
      UpdateExpression: "SET dashboardMaintAt = :now",
      ExpressionAttributeValues: {
        ":now": now,
        ":leaseExpiry": leaseExpiry
      }
    }));
    return { acquired: true };
  } catch (err) {
    if (isConditionalFailure2(err)) {
      return { acquired: false };
    }
    throw err;
  }
}
async function runDashboardMaintenance(client, tableName2, userId, games2, deps) {
  const now = deps.now?.() ?? Date.now();
  const lock = await acquireDashboardMaintenanceLock(client, tableName2, userId, now);
  if (!lock.acquired) {
    return { games: games2, evictedIds: [], maintenanceRan: false };
  }
  const maintainedGames = await sweepUserGameTimeouts(games2, {
    client: deps.client,
    tableName: deps.tableName,
    timeloss: deps.timeloss,
    now: () => now,
    log: deps.log
  });
  return {
    games: maintainedGames,
    evictedIds: [],
    maintenanceRan: true
  };
}
var DASHBOARD_MAINTENANCE_LEASE_MS;
var init_dashboardMaintenance = __esm({
  "lib/dashboardMaintenance.ts"() {
    "use strict";
    init_gameTimeout();
    DASHBOARD_MAINTENANCE_LEASE_MS = 3e4;
  }
});

// lib/meQuery.ts
function buildMeProfilePayload(user, ancillary, activeGames) {
  return {
    id: user.id,
    name: user.name,
    admin: user.admin === true,
    organizer: user.organizer === true,
    language: user.language,
    country: user.country,
    settings: user.settings,
    stars: user.stars ?? [],
    bggid: user.bggid,
    about: user.about,
    mayPush: user.mayPush === true,
    publicRivalries: user.publicRivalries === true,
    activeGames,
    bots: ancillary.bots,
    tags: ancillary.tags,
    palettes: ancillary.palettes,
    realStanding: ancillary.realStanding,
    customizations: ancillary.customizations,
    blocked: ancillary.blocked,
    watchedGames: ancillary.watchedGames,
    highlights: ancillary.highlights,
    representatives: ancillary.representatives
  };
}
function buildMeDashboardPayload(user, ancillary, games2, challenges, notifications = []) {
  const profile = buildMeProfilePayload(user, ancillary, []);
  const { activeGames: _activeGames, ...profileWithoutActive } = profile;
  return {
    ...profileWithoutActive,
    games: games2,
    notifications,
    ...challenges
  };
}
var init_meQuery = __esm({
  "lib/meQuery.ts"() {
    "use strict";
  }
});

// lib/touchUserLastSeen.ts
import {
  BatchGetCommand,
  UpdateCommand as UpdateCommand8
} from "@aws-sdk/lib-dynamodb";
async function getUsersLastSeen(client, tableName2, userIds) {
  const result = /* @__PURE__ */ new Map();
  if (userIds.length === 0) {
    return result;
  }
  const humanIds = [...new Set(userIds)];
  for (let i = 0; i < humanIds.length; i += 100) {
    const chunk = humanIds.slice(i, i + 100);
    const response = await client.send(new BatchGetCommand({
      RequestItems: {
        [tableName2]: {
          Keys: chunk.map((id) => ({ pk: "USERS", sk: id })),
          ProjectionExpression: "sk, lastSeen"
        }
      }
    }));
    for (const item of response.Responses?.[tableName2] ?? []) {
      const id = item.sk;
      result.set(id, typeof item.lastSeen === "number" ? item.lastSeen : void 0);
    }
  }
  for (const id of humanIds) {
    if (!result.has(id)) {
      result.set(id, void 0);
    }
  }
  return result;
}
var TOUCH_USER_LAST_SEEN_INTERVAL_MS;
var init_touchUserLastSeen = __esm({
  "lib/touchUserLastSeen.ts"() {
    "use strict";
    TOUCH_USER_LAST_SEEN_INTERVAL_MS = 15 * 60 * 1e3;
  }
});

// lib/pushSubscriptions.ts
import { createHash } from "crypto";
import { DeleteCommand as DeleteCommand6, GetCommand as GetCommand9, PutCommand as PutCommand5, QueryCommand as QueryCommand5 } from "@aws-sdk/lib-dynamodb";
function pushSubscriptionKey(endpoint) {
  return createHash("sha256").update(endpoint).digest("hex").slice(0, 16);
}
function pushSortKey(userId, endpoint) {
  return `${userId}#${pushSubscriptionKey(endpoint)}`;
}
function tableName() {
  return process.env.ABSTRACT_PLAY_TABLE;
}
async function queryPushSubscriptions(userId) {
  const subscriptions = [];
  const skPrefix = `${userId}#`;
  let lastKey;
  do {
    const result = await docClient.send(
      new QueryCommand5({
        TableName: tableName(),
        KeyConditionExpression: "#pk = :pk AND begins_with(#sk, :skPrefix)",
        ExpressionAttributeNames: { "#pk": "pk", "#sk": "sk" },
        ExpressionAttributeValues: {
          ":pk": PUSH_PK,
          ":skPrefix": skPrefix
        },
        ExclusiveStartKey: lastKey
      })
    );
    if (result.Items !== void 0) {
      subscriptions.push(...result.Items);
    }
    lastKey = result.LastEvaluatedKey;
  } while (lastKey !== void 0);
  const legacy = await docClient.send(
    new GetCommand9({
      TableName: tableName(),
      Key: { pk: PUSH_PK, sk: userId }
    })
  );
  if (legacy.Item !== void 0) {
    subscriptions.push(legacy.Item);
  }
  return subscriptions;
}
async function deletePushSubscription(sk) {
  await docClient.send(
    new DeleteCommand6({
      TableName: tableName(),
      Key: { pk: PUSH_PK, sk }
    })
  );
}
async function deleteAllPushSubscriptions(userId) {
  const subscriptions = await queryPushSubscriptions(userId);
  await Promise.all(subscriptions.map((sub) => deletePushSubscription(sub.sk)));
}
async function deletePushSubscriptionByEndpoint(userId, endpoint) {
  if (endpoint === void 0 || typeof endpoint !== "string" || endpoint.length === 0) {
    throw new Error("deletePush: missing endpoint");
  }
  await deletePushSubscription(pushSortKey(userId, endpoint));
}
async function savePushSubscription(userId, payload) {
  const endpoint = payload?.endpoint;
  if (endpoint === void 0 || typeof endpoint !== "string" || endpoint.length === 0) {
    throw new Error("savePush: missing payload.endpoint");
  }
  const sk = pushSortKey(userId, endpoint);
  await docClient.send(
    new PutCommand5({
      TableName: tableName(),
      Item: {
        pk: PUSH_PK,
        sk,
        payload,
        endpoint,
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      }
    })
  );
  await docClient.send(
    new DeleteCommand6({
      TableName: tableName(),
      Key: { pk: PUSH_PK, sk: userId }
    })
  );
}
async function sendPushToSubscriptions(opts, subscriptions, sendNotification = import_web_push.default.sendNotification.bind(import_web_push.default), logError = console.error) {
  if (subscriptions.length === 0) {
    return;
  }
  let subject = "https://play.abstractplay.com";
  if (process.env.WEBSOCKET_STAGE === "dev") {
    subject = "https://play.dev.abstractplay.com";
  }
  const { body, title, topic, url } = opts;
  const options = {
    vapidDetails: {
      subject,
      publicKey: process.env.VAPID_PUBLIC_KEY,
      privateKey: process.env.VAPID_PRIVATE_KEY
    },
    // @ts-ignore web-push topic option
    topic
  };
  const payload = JSON.stringify({ title, body, url, topic });
  await Promise.allSettled(
    subscriptions.map(async (sub) => {
      try {
        const result = await sendNotification(sub.payload, payload, options);
        console.log(`Result of webpush for ${sub.sk}:`);
        console.log(result);
      } catch (err) {
        if ("statusCode" in err && PERMANENT_FAILURES.has(err.statusCode)) {
          console.log(`Removing stale push subscription ${sub.sk} (${err.statusCode})`);
          await deletePushSubscription(sub.sk);
        } else {
          logError(err);
        }
      }
    })
  );
}
var import_web_push, docClient, PUSH_PK, PERMANENT_FAILURES;
var init_pushSubscriptions = __esm({
  "lib/pushSubscriptions.ts"() {
    "use strict";
    import_web_push = __toESM(require_src2());
    init_ddb();
    docClient = ddbDocClient;
    PUSH_PK = "PUSH";
    PERMANENT_FAILURES = /* @__PURE__ */ new Set([404, 410]);
  }
});

// lib/playgroundSaves.ts
import {
  DeleteCommand as DeleteCommand7,
  GetCommand as GetCommand10,
  PutCommand as PutCommand6,
  QueryCommand as QueryCommand6
} from "@aws-sdk/lib-dynamodb";
function playgroundPk(userId) {
  return `PLAYGROUND#${userId}`;
}
function validatePlaygroundSaveInput(pars) {
  if (typeof pars.name !== "string" || pars.name.trim() === "") {
    return { ok: false, message: "name is required." };
  }
  if (typeof pars.metaGame !== "string" || pars.metaGame.trim() === "") {
    return { ok: false, message: "metaGame is required." };
  }
  if (typeof pars.body !== "string") {
    return { ok: false, message: "body must be a string." };
  }
  try {
    JSON.parse(pars.body);
  } catch {
    return { ok: false, message: "body must be valid JSON." };
  }
  const dateMs = new Date(pars.date).getTime();
  if (Number.isNaN(dateMs)) {
    return { ok: false, message: "date is invalid." };
  }
  return {
    ok: true,
    data: {
      name: pars.name.trim(),
      metaGame: pars.metaGame.trim(),
      date: dateMs,
      body: pars.body
    }
  };
}
async function queryAllItems3(client, params2) {
  const items = [];
  let lastKey;
  do {
    const result = await client.send(new QueryCommand6({
      ...params2,
      ExclusiveStartKey: lastKey
    }));
    if (result.Items) {
      items.push(...result.Items);
    }
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);
  return items;
}
async function listPlaygroundSaves(client, tableName2, userId) {
  const items = await queryAllItems3(client, {
    TableName: tableName2,
    KeyConditionExpression: "#pk = :pk",
    ExpressionAttributeNames: { "#pk": "pk", "#id": "id", "#name": "name", "#metaGame": "metaGame", "#date": "date" },
    ExpressionAttributeValues: { ":pk": playgroundPk(userId) },
    ProjectionExpression: "#id, #name, #metaGame, #date"
  });
  return items.map((item) => ({
    id: item.id,
    name: item.name,
    metaGame: item.metaGame,
    date: item.date
  }));
}
async function getPlaygroundSave(client, tableName2, userId, id) {
  const data = await client.send(new GetCommand10({
    TableName: tableName2,
    Key: { pk: playgroundPk(userId), sk: id }
  }));
  if (data.Item === void 0) {
    return void 0;
  }
  return hydratePlaygroundBody(data.Item);
}
async function putPlaygroundSave(client, tableName2, userId, id, fields) {
  const record = {
    pk: playgroundPk(userId),
    sk: id,
    id,
    name: fields.name,
    metaGame: fields.metaGame,
    date: fields.date,
    body: fields.body
  };
  const stored = preparePlaygroundBodyForStorage(record);
  await client.send(new PutCommand6({
    TableName: tableName2,
    Item: stored
  }));
  return record;
}
async function deletePlaygroundSave(client, tableName2, userId, id) {
  await client.send(new DeleteCommand7({
    TableName: tableName2,
    Key: { pk: playgroundPk(userId), sk: id }
  }));
}
var init_playgroundSaves = __esm({
  "lib/playgroundSaves.ts"() {
    "use strict";
    init_gameState();
  }
});

// lib/summaryRatings.ts
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
async function loadSummaryRatingsCache() {
  if (cache !== void 0 && Date.now() - cache.loadedAt < SUMMARY_RATINGS_TTL_MS) {
    return cache;
  }
  const response = await s3.send(new GetObjectCommand({
    Bucket: REC_BUCKET,
    Key: SUMMARY_RATINGS_KEY
  }));
  const body = await response.Body?.transformToString();
  if (body === void 0) {
    throw new Error(`Unable to load s3://${REC_BUCKET}/${SUMMARY_RATINGS_KEY}`);
  }
  const parsed = JSON.parse(body);
  const highest = parsed.ratings?.highest;
  if (highest === void 0) {
    throw new Error(`Missing ratings.highest in ${SUMMARY_RATINGS_KEY}`);
  }
  cache = {
    highest,
    playerCountsByUid: parsed.ratings?.playerCountsByUid ?? {},
    loadedAt: Date.now()
  };
  return cache;
}
async function loadSummaryPlayerCountsByUid() {
  return (await loadSummaryRatingsCache()).playerCountsByUid;
}
var REC_BUCKET, SUMMARY_RATINGS_KEY, SUMMARY_RATINGS_TTL_MS, s3, cache;
var init_summaryRatings = __esm({
  "lib/summaryRatings.ts"() {
    "use strict";
    REC_BUCKET = "records.abstractplay.com";
    SUMMARY_RATINGS_KEY = "_summary-ratings.json";
    SUMMARY_RATINGS_TTL_MS = 5 * 60 * 1e3;
    s3 = new S3Client({ region: "us-east-1" });
  }
});

// lib/recommendationEvents.ts
import {
  PutCommand as PutCommand7,
  QueryCommand as QueryCommand7
} from "@aws-sdk/lib-dynamodb";
function recommendationEventsPk(userId) {
  return `${RECOMMENDATION_EVENTS_PK_PREFIX}${userId}`;
}
function isNonEmptyString(value) {
  return typeof value === "string" && value.trim() !== "";
}
function isRecommendationEventType(value) {
  return RECOMMENDATION_EVENT_TYPES.includes(value);
}
function isRecommendationSurface(value) {
  return RECOMMENDATION_SURFACES.includes(value);
}
function isRecommendationReasonType(value) {
  return RECOMMENDATION_REASON_TYPES.includes(value);
}
function isRecommendationTier(value) {
  return RECOMMENDATION_TIERS.includes(value);
}
function startOfUtcDayMs(now = Date.now()) {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}
function recommendationExpiresAt(now = Date.now()) {
  return Math.floor(now / 1e3) + RECOMMENDATION_EVENT_TTL_DAYS * SEC_PER_DAY;
}
function uniqueSortKey(now = Date.now()) {
  return `${now}#${Math.random().toString(36).slice(2, 10)}`;
}
function validateRecommendationEventPars(pars) {
  if (!isNonEmptyString(pars.event) || !isRecommendationEventType(pars.event)) {
    return { ok: false, message: "event must be rec_show, rec_click, or rec_challenge." };
  }
  if (!isNonEmptyString(pars.batchId)) {
    return { ok: false, message: "batchId is required." };
  }
  if (!isNonEmptyString(pars.surface) || !isRecommendationSurface(pars.surface)) {
    return { ok: false, message: "surface must be gamePicker, explore, or dashboard." };
  }
  if (!isNonEmptyString(pars.tier) || !isRecommendationTier(pars.tier)) {
    return { ok: false, message: "tier must be cold or warm." };
  }
  const now = Date.now();
  const record = {
    pk: "",
    sk: uniqueSortKey(now),
    event: pars.event,
    batchId: pars.batchId.trim(),
    surface: pars.surface,
    tier: pars.tier,
    expiresAt: recommendationExpiresAt(now)
  };
  if (pars.event === "rec_show") {
    if (!Array.isArray(pars.gameIds) || pars.gameIds.length === 0) {
      return { ok: false, message: "gameIds must be a non-empty array for rec_show." };
    }
    if (!pars.gameIds.every((id) => isNonEmptyString(id))) {
      return { ok: false, message: "gameIds must contain non-empty strings." };
    }
    if (!Array.isArray(pars.reasons) || pars.reasons.length !== pars.gameIds.length) {
      return { ok: false, message: "reasons must be an array matching gameIds length for rec_show." };
    }
    if (!pars.reasons.every((reason) => isNonEmptyString(reason))) {
      return { ok: false, message: "reasons must contain non-empty strings." };
    }
    record.gameIds = pars.gameIds.map((id) => id.trim());
    record.reasons = pars.reasons.map((reason) => reason.trim());
  }
  if (pars.event === "rec_click") {
    if (!isNonEmptyString(pars.metaGame)) {
      return { ok: false, message: "metaGame is required for rec_click." };
    }
    if (typeof pars.position !== "number" || !Number.isInteger(pars.position) || pars.position < 0) {
      return { ok: false, message: "position must be a non-negative integer for rec_click." };
    }
    if (!isNonEmptyString(pars.reasonType) || !isRecommendationReasonType(pars.reasonType)) {
      return { ok: false, message: "reasonType must be content, cooccur, popularity, or new for rec_click." };
    }
    record.metaGame = pars.metaGame.trim();
    record.position = pars.position;
    record.reasonType = pars.reasonType;
  }
  if (pars.event === "rec_challenge") {
    if (!isNonEmptyString(pars.metaGame)) {
      return { ok: false, message: "metaGame is required for rec_challenge." };
    }
    record.metaGame = pars.metaGame.trim();
  }
  return { ok: true, data: record };
}
async function countRecommendationEventsToday(client, tableName2, userId) {
  const pk = recommendationEventsPk(userId);
  const dayStartSk = String(startOfUtcDayMs());
  let count = 0;
  let lastKey;
  do {
    const result = await client.send(new QueryCommand7({
      TableName: tableName2,
      KeyConditionExpression: "pk = :pk AND sk >= :dayStart",
      ExpressionAttributeValues: {
        ":pk": pk,
        ":dayStart": dayStartSk
      },
      ExclusiveStartKey: lastKey,
      Select: "COUNT"
    }));
    count += result.Count ?? 0;
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);
  return count;
}
async function logRecommendationEvent(client, tableName2, userId, pars) {
  const validated = validateRecommendationEventPars(pars);
  if (!validated.ok) {
    return { ok: false, message: validated.message };
  }
  const eventCount = await countRecommendationEventsToday(client, tableName2, userId);
  if (eventCount >= RECOMMENDATION_EVENTS_PER_DAY_LIMIT) {
    return { ok: false, message: "Recommendation event rate limit exceeded." };
  }
  const item = {
    ...validated.data,
    pk: recommendationEventsPk(userId)
  };
  await client.send(new PutCommand7({
    TableName: tableName2,
    Item: item
  }));
  return { ok: true };
}
var RECOMMENDATION_EVENT_TYPES, RECOMMENDATION_SURFACES, RECOMMENDATION_REASON_TYPES, RECOMMENDATION_TIERS, RECOMMENDATION_EVENTS_PK_PREFIX, RECOMMENDATION_EVENT_TTL_DAYS, RECOMMENDATION_EVENTS_PER_DAY_LIMIT, SEC_PER_DAY;
var init_recommendationEvents = __esm({
  "lib/recommendationEvents.ts"() {
    "use strict";
    RECOMMENDATION_EVENT_TYPES = ["rec_show", "rec_click", "rec_challenge"];
    RECOMMENDATION_SURFACES = ["gamePicker", "explore", "dashboard"];
    RECOMMENDATION_REASON_TYPES = ["content", "cooccur", "popularity", "new"];
    RECOMMENDATION_TIERS = ["cold", "warm"];
    RECOMMENDATION_EVENTS_PK_PREFIX = "RECOMMENDS#";
    RECOMMENDATION_EVENT_TTL_DAYS = 90;
    RECOMMENDATION_EVENTS_PER_DAY_LIMIT = 50;
    SEC_PER_DAY = 86400;
  }
});

// lib/aboutText.ts
function countUrls(text) {
  const urls = /* @__PURE__ */ new Set();
  const httpMatches = text.match(/https?:\/\/[^\s)]+/gi) ?? [];
  for (const match of httpMatches) {
    urls.add(match);
  }
  for (const match of text.matchAll(MARKDOWN_LINK_URL_RE)) {
    const target = match[1]?.trim();
    if (target && /^https?:\/\//i.test(target)) {
      urls.add(target);
    }
  }
  return urls.size;
}
function aboutTextByteLength(text) {
  return Buffer.byteLength(text, "utf8");
}
function validateAboutText(value) {
  if (typeof value !== "string") {
    return { ok: false, message: "About text must be a string." };
  }
  if (DISALLOWED_CONTROL_RE.test(value)) {
    return { ok: false, message: "About text contains disallowed control characters." };
  }
  if (HTML_TAG_RE.test(value)) {
    return { ok: false, message: "HTML is not allowed in about text. Use Markdown instead." };
  }
  if (IMAGE_MARKDOWN_RE.test(value)) {
    return { ok: false, message: "Images are not allowed in about text." };
  }
  if (aboutTextByteLength(value) > ABOUT_MAX_BYTES) {
    return { ok: false, message: `About text exceeds the ${ABOUT_MAX_BYTES} byte limit.` };
  }
  if (countUrls(value) > ABOUT_MAX_URLS) {
    return { ok: false, message: `About text may contain at most ${ABOUT_MAX_URLS} links.` };
  }
  return { ok: true, text: value };
}
var ABOUT_MAX_BYTES, ABOUT_MAX_URLS, HTML_TAG_RE, IMAGE_MARKDOWN_RE, MARKDOWN_LINK_URL_RE, DISALLOWED_CONTROL_RE;
var init_aboutText = __esm({
  "lib/aboutText.ts"() {
    "use strict";
    ABOUT_MAX_BYTES = 100 * 1024;
    ABOUT_MAX_URLS = 20;
    HTML_TAG_RE = /<[a-z]/i;
    IMAGE_MARKDOWN_RE = /!\[[^\]]*\]\([^)]*\)/;
    MARKDOWN_LINK_URL_RE = /\[[^\]]*\]\(([^)]+)\)/g;
    DISALLOWED_CONTROL_RE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/;
  }
});

// lib/aboutSaves.ts
function utcDateString(date = /* @__PURE__ */ new Date()) {
  return date.toISOString().slice(0, 10);
}
function checkAboutSaveAllowed(previousText, newText, state, now = /* @__PURE__ */ new Date()) {
  const previous = previousText ?? "";
  if (newText === previous) {
    return { ok: true, skip: true };
  }
  const today = utcDateString(now);
  const priorDay = state.aboutSaveDay;
  const priorCount = priorDay === today ? state.aboutSaveCount ?? 0 : 0;
  if (priorCount >= ABOUT_SAVES_PER_DAY_LIMIT) {
    return {
      ok: false,
      message: "About save rate limit exceeded. Try again tomorrow."
    };
  }
  return {
    ok: true,
    skip: false,
    aboutSaveDay: today,
    aboutSaveCount: priorCount + 1
  };
}
var ABOUT_SAVES_PER_DAY_LIMIT;
var init_aboutSaves = __esm({
  "lib/aboutSaves.ts"() {
    "use strict";
    ABOUT_SAVES_PER_DAY_LIMIT = 10;
  }
});

// lib/layoutFeedbackEvents.ts
import {
  PutCommand as PutCommand8
} from "@aws-sdk/lib-dynamodb";
function isNonEmptyString2(value) {
  return typeof value === "string" && value.trim() !== "";
}
function isLayoutFeedbackEventType(value) {
  return LAYOUT_FEEDBACK_EVENT_TYPES.includes(value);
}
function isLayoutFeedbackLayoutId(value) {
  return LAYOUT_FEEDBACK_LAYOUT_IDS.includes(value);
}
function isLayoutFeedbackRating(value) {
  return LAYOUT_FEEDBACK_RATINGS.includes(value);
}
function uniqueSortKey2(now = Date.now()) {
  return `${now}#${Math.random().toString(36).slice(2, 10)}`;
}
function layoutFeedbackEventsPk(userId) {
  return `${LAYOUT_FEEDBACK_PK_PREFIX}${userId}`;
}
function validateLayoutFeedbackEventPars(pars) {
  if (!isNonEmptyString2(pars.event) || !isLayoutFeedbackEventType(pars.event)) {
    return {
      ok: false,
      message: "event must be session_start, feedback, feedback_note, switch_to_classic, or layout_switch."
    };
  }
  if (!isNonEmptyString2(pars.layoutId) || !isLayoutFeedbackLayoutId(pars.layoutId)) {
    return { ok: false, message: "layoutId must be strip, card, or narrative." };
  }
  const now = Date.now();
  const record = {
    pk: "",
    sk: uniqueSortKey2(now),
    event: pars.event,
    layoutId: pars.layoutId
  };
  if (isNonEmptyString2(pars.gameId)) {
    record.gameId = pars.gameId.trim();
  }
  if (typeof pars.durationMs === "number" && Number.isFinite(pars.durationMs) && pars.durationMs >= 0) {
    record.durationMs = Math.floor(pars.durationMs);
  }
  if (pars.event === "feedback") {
    if (!isNonEmptyString2(pars.rating) || !isLayoutFeedbackRating(pars.rating)) {
      return { ok: false, message: "rating must be up or down for feedback." };
    }
    record.rating = pars.rating;
  }
  if (pars.event === "feedback_note") {
    if (!isNonEmptyString2(pars.comment)) {
      return { ok: false, message: "comment is required for feedback_note." };
    }
    const trimmed = pars.comment.trim();
    if (trimmed.length > LAYOUT_FEEDBACK_MAX_COMMENT_LENGTH) {
      return {
        ok: false,
        message: `comment must be at most ${LAYOUT_FEEDBACK_MAX_COMMENT_LENGTH} characters.`
      };
    }
    record.comment = trimmed;
  }
  if (pars.event === "layout_switch") {
    if (!isNonEmptyString2(pars.toLayoutId) || !isLayoutFeedbackLayoutId(pars.toLayoutId)) {
      return { ok: false, message: "toLayoutId must be strip, card, or narrative for layout_switch." };
    }
    record.toLayoutId = pars.toLayoutId;
  }
  return { ok: true, data: record };
}
async function logLayoutFeedbackEvent(client, tableName2, userId, pars) {
  const validated = validateLayoutFeedbackEventPars(pars);
  if (!validated.ok) {
    return { ok: false, message: validated.message };
  }
  const item = {
    ...validated.data,
    pk: layoutFeedbackEventsPk(userId)
  };
  await client.send(new PutCommand8({
    TableName: tableName2,
    Item: item
  }));
  return { ok: true };
}
var LAYOUT_FEEDBACK_EVENT_TYPES, LAYOUT_FEEDBACK_LAYOUT_IDS, LAYOUT_FEEDBACK_RATINGS, LAYOUT_FEEDBACK_PK_PREFIX, LAYOUT_FEEDBACK_MAX_COMMENT_LENGTH;
var init_layoutFeedbackEvents = __esm({
  "lib/layoutFeedbackEvents.ts"() {
    "use strict";
    LAYOUT_FEEDBACK_EVENT_TYPES = [
      "session_start",
      "feedback",
      "feedback_note",
      "switch_to_classic",
      "layout_switch"
    ];
    LAYOUT_FEEDBACK_LAYOUT_IDS = ["strip", "card", "narrative"];
    LAYOUT_FEEDBACK_RATINGS = ["up", "down"];
    LAYOUT_FEEDBACK_PK_PREFIX = "LAYOUTFB#";
    LAYOUT_FEEDBACK_MAX_COMMENT_LENGTH = 500;
  }
});

// lib/notifications.ts
import {
  DeleteCommand as DeleteCommand8,
  GetCommand as GetCommand11,
  PutCommand as PutCommand9,
  QueryCommand as QueryCommand8,
  UpdateCommand as UpdateCommand9
} from "@aws-sdk/lib-dynamodb";
function inAppSettingsMapFromUsers(users) {
  return new Map(users.map((u) => [u.id, u.settings]));
}
function inAppCategoryForBody(body) {
  switch (body.type) {
    case "challengeIssued":
    case "challengeDeclined":
    case "challengeRevoked":
      return "challenges";
    case "gameStart":
      return "gameStart";
    case "gameEnd":
      return "gameEnd";
    case "ratingChange":
      return "ratingChange";
    case "eventInvitation":
      return "eventInvitation";
    case "completedGameChat":
      return "completedGameChat";
    case "tournamentStart":
      return "tournamentStart";
    case "tournamentEnd":
      return "tournamentEnd";
    default: {
      const _exhaustive = body;
      return _exhaustive;
    }
  }
}
function wantsInAppNotification(settings, category) {
  const prefs = settings?.all?.inAppNotifications;
  if (prefs === void 0) {
    return true;
  }
  if (!Object.prototype.hasOwnProperty.call(prefs, category)) {
    return true;
  }
  return prefs[category] === true;
}
function userSettingsFromMap(settingsByUserId, userId) {
  return settingsByUserId?.get(userId);
}
function notificationPk(userId) {
  return `${NOTIFICATION_PK_PREFIX}${userId}`;
}
function notificationInitialExpiresAt(now = Date.now()) {
  return Math.floor(now / 1e3) + NOTIFICATION_INITIAL_TTL_DAYS * SEC_PER_DAY2;
}
function notificationSeenExpiresAt(now = Date.now()) {
  return Math.floor(now / 1e3) + NOTIFICATION_SEEN_TTL_DAYS * SEC_PER_DAY2;
}
function uniqueSortKey3(now = Date.now()) {
  return `${now}#${Math.random().toString(36).slice(2, 10)}`;
}
function parseNotificationCreatedAt(sk) {
  const prefix = sk.split("#")[0];
  const createdAt = Number(prefix);
  if (!Number.isFinite(createdAt)) {
    return 0;
  }
  return createdAt;
}
function gameVariants(game2) {
  return game2.variants ?? [];
}
function opponentForPlayer(game2, playerId, humanPlayers) {
  const others = humanPlayers.filter((p) => p.id !== playerId);
  return others[0];
}
function gameEndResult(game2, playerId) {
  const winners = game2.winner ?? [];
  if (winners.length !== 1) {
    return "draw";
  }
  const winnerIndex = winners[0] - 1;
  const winnerId = game2.players[winnerIndex]?.id;
  if (winnerId === playerId) {
    return "win";
  }
  return "lose";
}
function optionalNotificationNote(comment) {
  const trimmed = comment?.trim();
  return trimmed || void 0;
}
function buildNotificationItem(userId, body, now = Date.now()) {
  return {
    pk: notificationPk(userId),
    sk: uniqueSortKey3(now),
    body,
    expiresAt: notificationInitialExpiresAt(now)
  };
}
async function createNotification(client, tableName2, userId, body, options) {
  if (await isBotId(userId)) {
    return;
  }
  const category = inAppCategoryForBody(body);
  if (!wantsInAppNotification(options?.userSettings, category)) {
    return;
  }
  await putNotificationItem(client, tableName2, userId, body);
}
async function putNotificationItem(client, tableName2, userId, body) {
  await client.send(new PutCommand9({
    TableName: tableName2,
    Item: buildNotificationItem(userId, body)
  }));
}
async function loadNotificationsForDashboard(client, tableName2, userId, options) {
  const pk = notificationPk(userId);
  const nowMs = Date.now();
  const nowSec = Math.floor(nowMs / 1e3);
  const seenThresholdSec = notificationSeenExpiresAt(nowMs);
  const longTtlThresholdSec = nowSec + NOTIFICATION_SEEN_TTL_DAYS * SEC_PER_DAY2;
  const items = [];
  let lastKey;
  do {
    const result = await client.send(new QueryCommand8({
      TableName: tableName2,
      KeyConditionExpression: "pk = :pk",
      ExpressionAttributeValues: { ":pk": pk },
      ExclusiveStartKey: lastKey,
      ScanIndexForward: false
    }));
    if (result.Items !== void 0) {
      items.push(...result.Items);
    }
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);
  const survivors = [];
  const work = [];
  for (const item of items) {
    if (item.expiresAt <= nowSec) {
      work.push(client.send(new DeleteCommand8({
        TableName: tableName2,
        Key: { pk: item.pk, sk: item.sk }
      })));
      continue;
    }
    if (options.refreshExpiry && item.expiresAt > longTtlThresholdSec) {
      work.push(client.send(new UpdateCommand9({
        TableName: tableName2,
        Key: { pk: item.pk, sk: item.sk },
        UpdateExpression: "SET expiresAt = :exp",
        ExpressionAttributeValues: { ":exp": seenThresholdSec }
      })));
    }
    survivors.push({
      sk: item.sk,
      createdAt: parseNotificationCreatedAt(item.sk),
      body: item.body
    });
  }
  if (work.length > 0) {
    await Promise.all(work);
  }
  return survivors;
}
async function dismissNotification(client, tableName2, userId, sk) {
  const pk = notificationPk(userId);
  const existing = await client.send(new GetCommand11({
    TableName: tableName2,
    Key: { pk, sk }
  }));
  if (existing.Item === void 0) {
    return false;
  }
  await client.send(new DeleteCommand8({
    TableName: tableName2,
    Key: { pk, sk }
  }));
  return true;
}
async function enqueueGameStartNotifications(client, tableName2, game2, settingsByUserId) {
  const humanIds = await filterHumanIds(game2.players.map((p) => p.id));
  const humanPlayers = game2.players.filter((p) => humanIds.includes(p.id));
  const variants = gameVariants(game2);
  await Promise.all(humanPlayers.map(async (player) => {
    const opponent = opponentForPlayer(game2, player.id, humanPlayers);
    if (opponent === void 0) {
      return;
    }
    await createNotification(client, tableName2, player.id, {
      type: "gameStart",
      gameId: game2.id,
      metaGame: game2.metaGame,
      variants,
      opponentId: opponent.id,
      opponentName: opponent.name
    }, {
      userSettings: userSettingsFromMap(settingsByUserId, player.id)
    });
  }));
}
async function enqueueGameEndNotifications(client, tableName2, game2, settingsByUserId) {
  const variants = gameVariants(game2);
  const work = [];
  for (let ind = 0; ind < game2.players.length; ind += 1) {
    const player = game2.players[ind];
    work.push(createNotification(client, tableName2, player.id, {
      type: "gameEnd",
      gameId: game2.id,
      metaGame: game2.metaGame,
      variants,
      result: gameEndResult(game2, player.id)
    }, {
      userSettings: userSettingsFromMap(settingsByUserId, player.id)
    }));
  }
  await Promise.all(work);
}
async function hasActiveEventInvitationNotification(client, tableName2, userId, eventId, nowSec = Math.floor(Date.now() / 1e3)) {
  const pk = notificationPk(userId);
  let lastKey;
  do {
    const result = await client.send(new QueryCommand8({
      TableName: tableName2,
      KeyConditionExpression: "pk = :pk",
      ExpressionAttributeValues: { ":pk": pk },
      ExclusiveStartKey: lastKey
    }));
    for (const item of result.Items ?? []) {
      const rec = item;
      if (rec.expiresAt <= nowSec) {
        continue;
      }
      if (rec.body.type === "eventInvitation" && rec.body.eventId === eventId) {
        return true;
      }
    }
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);
  return false;
}
async function resolveEventInvitationNotifyIds(client, tableName2, inviteeIds, newlyInvitedIds, eventId) {
  const humanInvitees = await filterHumanIds(inviteeIds);
  const newlyInvited = new Set(await filterHumanIds(newlyInvitedIds));
  const toNotify = /* @__PURE__ */ new Set();
  for (const id of humanInvitees) {
    if (newlyInvited.has(id)) {
      toNotify.add(id);
      continue;
    }
    if (!await hasActiveEventInvitationNotification(client, tableName2, id, eventId)) {
      toNotify.add(id);
    }
  }
  return [...toNotify];
}
async function enqueueEventInvitationNotifications(client, tableName2, inviteeIds, invitation, settingsByUserId) {
  const humanIds = await filterHumanIds(inviteeIds);
  await Promise.all(humanIds.map((inviteeId) => createNotification(client, tableName2, inviteeId, {
    type: "eventInvitation",
    eventId: invitation.eventId,
    eventName: invitation.eventName,
    organizerId: invitation.organizerId,
    organizerName: invitation.organizerName
  }, {
    userSettings: userSettingsFromMap(settingsByUserId, inviteeId)
  })));
}
async function hasActiveCompletedGameChatNotification(client, tableName2, userId, gameId, nowSec = Math.floor(Date.now() / 1e3)) {
  const pk = notificationPk(userId);
  let lastKey;
  do {
    const result = await client.send(new QueryCommand8({
      TableName: tableName2,
      KeyConditionExpression: "pk = :pk",
      ExpressionAttributeValues: { ":pk": pk },
      ExclusiveStartKey: lastKey
    }));
    for (const item of result.Items ?? []) {
      const rec = item;
      if (rec.expiresAt <= nowSec) {
        continue;
      }
      if (rec.body.type === "completedGameChat" && rec.body.gameId === gameId) {
        return true;
      }
    }
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);
  return false;
}
async function enqueueCompletedGameChatNotifications(client, tableName2, gameId, metaGame, variants, players, commenterId, options) {
  const variantList = variants ?? [];
  const commenter = players.find((p) => p.id === commenterId);
  const commenterName = commenter?.name ?? "Someone";
  const work = [];
  for (const player of players) {
    if (player.id === commenterId) {
      continue;
    }
    work.push((async () => {
      if (await isBotId(player.id)) {
        return;
      }
      if (await hasActiveCompletedGameChatNotification(client, tableName2, player.id, gameId)) {
        return;
      }
      await createNotification(client, tableName2, player.id, {
        type: "completedGameChat",
        gameId,
        metaGame,
        variants: variantList,
        commenterId,
        commenterName,
        ...options?.backfill ? { backfill: true } : {}
      }, {
        userSettings: userSettingsFromMap(options?.settingsByUserId, player.id)
      });
    })());
  }
  await Promise.all(work);
}
var NOTIFICATION_PK_PREFIX, NOTIFICATION_INITIAL_TTL_DAYS, NOTIFICATION_SEEN_TTL_DAYS, SEC_PER_DAY2;
var init_notifications = __esm({
  "lib/notifications.ts"() {
    "use strict";
    init_participants();
    NOTIFICATION_PK_PREFIX = "NOTIFICATION#";
    NOTIFICATION_INITIAL_TTL_DAYS = 180;
    NOTIFICATION_SEEN_TTL_DAYS = 7;
    SEC_PER_DAY2 = 86400;
  }
});

// api/abstractplay.ts
import { DynamoDBClient as DynamoDBClient2 } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient as DynamoDBDocumentClient8, PutCommand as PutCommand10, GetCommand as GetCommand12, UpdateCommand as UpdateCommand10, DeleteCommand as DeleteCommand9, QueryCommand as QueryCommand9, BatchGetCommand as BatchGetCommand2 } from "@aws-sdk/lib-dynamodb";
import { SQSClient as SQSClient3, SendMessageCommand as SendMessageCommand3 } from "@aws-sdk/client-sqs";
import { CognitoIdentityProviderClient as CognitoIdentityProviderClient2, CreateUserPoolClientCommand, DeleteUserPoolClientCommand } from "@aws-sdk/client-cognito-identity-provider";
import { gameinfo as gameinfo3, GameFactory as GameFactory7 } from "@abstractplay/gameslib";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
function resolvePlayerLanguage(language) {
  if (language && REGISTERED_LANGUAGES.includes(language)) {
    return language;
  }
  if (language) {
    const lower = language.toLowerCase();
    if (lower === "es" || lower.startsWith("es-")) {
      return "es-US";
    }
  }
  return "en";
}
function toNotificationGame(game2) {
  return {
    id: game2.id,
    metaGame: game2.metaGame,
    variants: game2.variants,
    players: game2.players.map((p) => ({ id: p.id, name: p.name })),
    winner: game2.winner
  };
}
async function sendCommandWithRetry(command, maxRetries = 8, initialDelay = 100, maxDelay = 5e3) {
  let retries = 0;
  while (retries < maxRetries) {
    try {
      return await ddbDocClient2.send(command);
    } catch (err) {
      if (["ThrottlingException", "ProvisionedThroughputExceededException", "InternalServerError", "ServiceUnavailable"].includes(err.name)) {
        retries++;
        if (retries >= maxRetries) {
          console.error(`Command failed after ${maxRetries} retries.`);
          throw err;
        }
        const delay = Math.min(initialDelay * Math.pow(2, retries - 1), maxDelay);
        const jitter = delay * 0.1 * Math.random();
        console.log(`Retryable error (${err.name}) caught. Retrying in ${Math.round(delay + jitter)}ms...`);
        await sleep(delay + jitter);
      } else {
        throw err;
      }
    }
  }
  throw new Error(`Command failed after ${maxRetries} retries without a retryable error`);
}
async function ensureMetaGameCountEntry(metaGame) {
  await ensureShardedMetaGameCountEntry(
    ddbDocClient2,
    process.env.ABSTRACT_PLAY_TABLE,
    metaGame
  );
}
async function ensureMissingMetaGameCounts() {
  const tableName2 = process.env.ABSTRACT_PLAY_TABLE;
  const metaGames = [];
  gameinfo3.forEach((g) => metaGames.push(g.uid));
  const missing = [];
  for (let i = 0; i < metaGames.length; i += 100) {
    const chunk = metaGames.slice(i, i + 100);
    const data = await ddbDocClient2.send(new BatchGetCommand2({
      RequestItems: {
        [tableName2]: {
          Keys: chunk.map((metaGame) => ({ pk: `METAGAMES#${metaGame}`, sk: "COUNTS" }))
        }
      }
    }));
    const found = new Set(
      (data.Responses?.[tableName2] ?? []).map((item) => String(item.pk).replace("METAGAMES#", ""))
    );
    for (const metaGame of chunk) {
      if (!found.has(metaGame)) {
        missing.push(metaGame);
      }
    }
  }
  if (missing.length === 0) {
    return;
  }
  console.log(`Initializing sharded METAGAMES# counts for new games: ${missing.join(", ")}`);
  await Promise.all(missing.map((metaGame) => ensureMetaGameCountEntry(metaGame)));
}
function parseLambdaIntegrationBody(body) {
  if (body === void 0 || body === null) {
    throw new Error("Missing request body");
  }
  if (typeof body === "string") {
    return JSON.parse(body);
  }
  return body;
}
async function userNames() {
  console.log("userNames: Scanning users.");
  try {
    const [data, botData] = await Promise.all([
      ddbDocClient2.send(
        new QueryCommand9({
          TableName: process.env.ABSTRACT_PLAY_TABLE,
          KeyConditionExpression: "#pk = :pk",
          ExpressionAttributeValues: { ":pk": "USERS" },
          ExpressionAttributeNames: { "#pk": "pk", "#name": "name" },
          ProjectionExpression: "sk, #name, lastSeen, country, stars, bggid",
          ReturnConsumedCapacity: "INDEXES"
        })
      ),
      ddbDocClient2.send(
        new QueryCommand9({
          TableName: process.env.ABSTRACT_PLAY_TABLE,
          KeyConditionExpression: "#pk = :pk",
          ExpressionAttributeValues: { ":pk": "BOT" },
          ExpressionAttributeNames: { "#pk": "pk", "#name": "name" },
          ProjectionExpression: "sk, #name, lastseen, description, supported"
        })
      )
    ]);
    const users = data.Items;
    if (users == void 0) {
      throw new Error("Found no users?");
    }
    const idx = users.findIndex((u) => u.sk === process.env.AIAI_USERID);
    if (idx !== -1) {
      users[idx].lastSeen = Date.now();
    }
    const userResults = users.map((u) => ({ id: u.sk, name: u.name, country: u.country, stars: u.stars, lastSeen: u.lastSeen, bggid: u.bggid, bot: false }));
    const botResults = (botData.Items ?? []).map((b) => ({
      id: b.sk,
      name: b.name,
      country: "",
      stars: [...new Set((b.supported ?? []).map((s) => s.meta))],
      lastSeen: b.lastseen ?? 0,
      bot: true
    }));
    return {
      statusCode: 200,
      body: JSON.stringify([...userResults, ...botResults]),
      headers
    };
  } catch (error2) {
    logGetItemError(error2);
    return formatReturnError(`Unable to query table ${process.env.ABSTRACT_PLAY_TABLE}`);
  }
}
async function challengeDetails(pars) {
  try {
    const data = await ddbDocClient2.send(
      new GetCommand12({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "CHALLENGE",
          "sk": pars.id
        }
      })
    );
    console.log("Got:");
    console.log(data);
    return {
      statusCode: 200,
      body: JSON.stringify(data.Item),
      headers
    };
  } catch (error2) {
    logGetItemError(error2);
    return formatReturnError(`Unable to get challenge ${pars.id} from table ${process.env.ABSTRACT_PLAY_TABLE}`);
  }
}
async function games(pars) {
  const game2 = pars.metaGame;
  console.log(game2);
  if (pars.type === "current") {
    try {
      const gamesData = await ddbDocClient2.send(
        new QueryCommand9({
          TableName: process.env.ABSTRACT_PLAY_TABLE,
          KeyConditionExpression: "#pk = :pk and begins_with(#sk, :sk)",
          ExpressionAttributeValues: { ":pk": "GAME", ":sk": game2 + "#0#" },
          ExpressionAttributeNames: { "#pk": "pk", "#sk": "sk" }
        })
      );
      const gamelist = gamesData.Items.map(hydrateGameState);
      const returnlist = gamelist.map((g) => {
        const state = GameFactory7(g.metaGame, g.state);
        if (state === void 0) {
          throw new Error(`Could not parse game state for ${g.metaGame}:
${g.state}`);
        }
        return {
          "id": g.id,
          "metaGame": g.metaGame,
          "players": g.players,
          "toMove": g.toMove,
          "gameStarted": g.gameStarted,
          "numMoves": state.stack.length - 1,
          "variants": state.variants,
          "commented": g.commented || 0
        };
      });
      return {
        statusCode: 200,
        body: JSON.stringify(returnlist),
        headers
      };
    } catch (error2) {
      logGetItemError(error2);
      return formatReturnError(`Unable to get games for ${pars.metaGame}`);
    }
  } else if (pars.type === "completed") {
    try {
      const gamesData = await ddbDocClient2.send(
        new QueryCommand9({
          TableName: process.env.ABSTRACT_PLAY_TABLE,
          KeyConditionExpression: "#pk = :pk",
          ExpressionAttributeValues: { ":pk": "COMPLETEDGAMES#" + game2 },
          ExpressionAttributeNames: { "#pk": "pk" }
        })
      );
      return {
        statusCode: 200,
        body: JSON.stringify(gamesData.Items),
        headers
      };
    } catch (error2) {
      logGetItemError(error2);
      return formatReturnError(`Unable to get games for ${pars.metaGame}`);
    }
  } else {
    return formatReturnError(`Unknown type ${pars.type}`);
  }
}
async function getPlayerRelationIds(userId, skPrefix) {
  const ids = [];
  let result = await ddbDocClient2.send(
    new QueryCommand9({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      KeyConditionExpression: "#pk = :pk AND begins_with(#sk, :skPrefix)",
      ExpressionAttributeValues: {
        ":pk": "PLAYER#" + userId,
        ":skPrefix": skPrefix
      },
      ExpressionAttributeNames: { "#pk": "pk", "#sk": "sk" },
      ProjectionExpression: "#sk"
    })
  );
  if (result.Items !== void 0) {
    for (const item of result.Items) {
      ids.push(item.sk.slice(skPrefix.length));
    }
  }
  let last = result.LastEvaluatedKey;
  while (last !== void 0) {
    result = await ddbDocClient2.send(
      new QueryCommand9({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        KeyConditionExpression: "#pk = :pk AND begins_with(#sk, :skPrefix)",
        ExpressionAttributeValues: {
          ":pk": "PLAYER#" + userId,
          ":skPrefix": skPrefix
        },
        ExpressionAttributeNames: { "#pk": "pk", "#sk": "sk" },
        ProjectionExpression: "#sk",
        ExclusiveStartKey: last
      })
    );
    if (result.Items !== void 0) {
      for (const item of result.Items) {
        ids.push(item.sk.slice(skPrefix.length));
      }
    }
    last = result.LastEvaluatedKey;
  }
  return ids;
}
async function block_player(blockingPlayerId, pars) {
  const blockedPlayerId = pars.playerId;
  if (blockingPlayerId === blockedPlayerId) {
    return formatReturnError("Cannot block yourself");
  }
  try {
    await Promise.all([
      ddbDocClient2.send(new PutCommand10({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Item: {
          pk: `PLAYER#${blockingPlayerId}`,
          sk: `BLOCKED#${blockedPlayerId}`
        }
      })),
      ddbDocClient2.send(new PutCommand10({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Item: {
          pk: `PLAYER#${blockedPlayerId}`,
          sk: `BLOCKEDBY#${blockingPlayerId}`
        }
      }))
    ]);
    return {
      statusCode: 200,
      body: JSON.stringify({ message: "Successfully blocked player" }),
      headers
    };
  } catch (error2) {
    logGetItemError(error2);
    return formatReturnError(`Unable to block player ${blockedPlayerId}`);
  }
}
async function unblock_player(blockingPlayerId, pars) {
  const blockedPlayerId = pars.playerId;
  try {
    await Promise.all([
      ddbDocClient2.send(new DeleteCommand9({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          pk: `PLAYER#${blockingPlayerId}`,
          sk: `BLOCKED#${blockedPlayerId}`
        }
      })),
      ddbDocClient2.send(new DeleteCommand9({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          pk: `PLAYER#${blockedPlayerId}`,
          sk: `BLOCKEDBY#${blockingPlayerId}`
        }
      }))
    ]);
    return {
      statusCode: 200,
      body: JSON.stringify({ message: "Successfully unblocked player" }),
      headers
    };
  } catch (error2) {
    logGetItemError(error2);
    return formatReturnError(`Unable to unblock player ${blockedPlayerId}`);
  }
}
async function standingChallenges(pars) {
  const game2 = pars.metaGame;
  console.log(game2);
  const blockedByPromise = pars.userId ? getPlayerRelationIds(pars.userId, "BLOCKEDBY#") : Promise.resolve([]);
  try {
    const [challengesData, blockedBy] = await Promise.all([
      ddbDocClient2.send(
        new QueryCommand9({
          TableName: process.env.ABSTRACT_PLAY_TABLE,
          KeyConditionExpression: "#pk = :pk",
          ExpressionAttributeValues: { ":pk": "STANDINGCHALLENGE#" + game2 },
          ExpressionAttributeNames: { "#pk": "pk" }
        })
      ),
      blockedByPromise
    ]);
    let items = challengesData.Items || [];
    if (blockedBy.length > 0) {
      const blockedBySet = new Set(blockedBy);
      items = items.filter((c) => !blockedBySet.has(c.challenger?.id));
    }
    return {
      statusCode: 200,
      body: JSON.stringify(items),
      headers
    };
  } catch (error2) {
    logGetItemError(error2);
    return formatReturnError(`Unable to get standing challenges for ${pars.metaGame}`);
  }
}
async function assembleTags() {
  try {
    const data = await ddbDocClient2.send(
      new QueryCommand9({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        KeyConditionExpression: "#pk = :pk",
        ExpressionAttributeValues: { ":pk": "TAG" },
        ExpressionAttributeNames: { "#pk": "pk" }
      })
    );
    const allTags = data.Items;
    const collated = /* @__PURE__ */ new Map();
    if (allTags !== void 0) {
      for (const rec of allTags) {
        for (const { meta, tags } of rec.tags) {
          const uniques = new Set(tags);
          if (collated.has(meta)) {
            for (const tag of collated.get(meta)) {
              uniques.add(tag);
            }
          }
          collated.set(meta, [...uniques.values()].sort((a, b) => a.localeCompare(b)));
        }
      }
    }
    return [...collated.entries()].map(([meta, tags]) => {
      return { meta, tags };
    });
  } catch (error2) {
    return void 0;
  }
}
async function metaGamesDetails() {
  try {
    await ensureMissingMetaGameCounts();
    const tableName2 = process.env.ABSTRACT_PLAY_TABLE;
    const metaGames = [];
    gameinfo3.forEach((g) => metaGames.push(g.uid));
    const details = {};
    let playerCountsByUid = {};
    try {
      playerCountsByUid = await loadSummaryPlayerCountsByUid();
    } catch (err) {
      console.warn("metaGamesDetails: batch ratings counts unavailable", err);
    }
    for (let i = 0; i < metaGames.length; i += 100) {
      const chunk = metaGames.slice(i, i + 100);
      const data = await ddbDocClient2.send(new BatchGetCommand2({
        RequestItems: {
          [tableName2]: {
            Keys: chunk.map((metaGame) => ({ pk: `METAGAMES#${metaGame}`, sk: "COUNTS" }))
          }
        }
      }));
      for (const item of data.Responses?.[tableName2] ?? []) {
        const metaGame = String(item.pk).replace("METAGAMES#", "");
        details[metaGame] = {
          currentgames: item.currentgames ?? 0,
          completedgames: item.completedgames ?? 0,
          standingchallenges: item.standingchallenges ?? 0,
          stars: item.stars ?? 0,
          ratings: playerCountsByUid[metaGame] ?? 0
        };
      }
    }
    gameinfo3.forEach((g) => {
      if (!details[g.uid]) {
        details[g.uid] = {
          ...DEFAULT_META_GAME_COUNTS,
          ratings: playerCountsByUid[g.uid] ?? 0
        };
      }
    });
    const taglist = await assembleTags();
    if (taglist === void 0) {
      throw new Error("An error occured while fetching game tags");
    }
    for (const key of Object.keys(details)) {
      const tags = taglist.find((l) => l.meta === key);
      if (tags !== void 0) {
        details[key].tags = [...tags.tags];
      } else {
        details[key].tags = [];
      }
    }
    const details2 = Object.keys(details).reduce((a, k) => ({
      ...a,
      [k]: {
        ...details[k],
        ratings: details[k].ratings ?? 0
      }
    }), {});
    return {
      statusCode: 200,
      body: JSON.stringify(details2),
      headers
    };
  } catch (error2) {
    logGetItemError(error2);
    return formatReturnError("Unable to get meta game details.");
  }
}
async function game(userid, pars) {
  try {
    if (pars.retryAttempt && pars.retryAttempt > 0) {
      console.log(`get_game called with retry attempt ${pars.retryAttempt} for game ${pars.id}, metaGame ${pars.metaGame}`);
    }
    if (pars.cbit !== 0 && pars.cbit !== 1 && pars.cbit !== "0" && pars.cbit !== "1") {
      return formatReturnError("cbit must be 0 or 1");
    }
    const getGame = ddbDocClient2.send(
      new GetCommand12({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "GAME",
          "sk": pars.metaGame + "#" + pars.cbit + "#" + pars.id
        }
      })
    );
    const getComments = ddbDocClient2.send(
      new GetCommand12({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "GAMECOMMENTS",
          "sk": pars.id
        },
        ReturnConsumedCapacity: "INDEXES"
      })
    );
    const getNote = ddbDocClient2.send(
      new GetCommand12({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "NOTE",
          "sk": `${pars.id}#${userid}`
        },
        ReturnConsumedCapacity: "INDEXES"
      })
    );
    const watchCountWork = countGameWatchers(
      ddbDocClient2,
      process.env.ABSTRACT_PLAY_TABLE,
      pars.id
    );
    const gameData = await getGame;
    let game2 = gameData.Item !== void 0 ? hydrateGameState(gameData.Item) : void 0;
    if (game2 === void 0 && (pars.cbit === 0 || pars.cbit === "0")) {
      const completedGameData = await ddbDocClient2.send(
        new GetCommand12({
          TableName: process.env.ABSTRACT_PLAY_TABLE,
          Key: {
            "pk": "GAME",
            "sk": pars.metaGame + "#1#" + pars.id
          }
        })
      );
      game2 = completedGameData.Item !== void 0 ? hydrateGameState(completedGameData.Item) : void 0;
    }
    if (game2 === void 0) {
      throw new Error(`Game ${pars.id}, metaGame ${pars.metaGame}, completed bit ${pars.cbit} not found`);
    }
    if ((pars.cbit === 0 || pars.cbit === "0") && game2.toMove && game2.toMove !== "") {
      const timeoutResult = await checkAndProcessGameTimeout({
        id: game2.id,
        metaGame: game2.metaGame,
        players: game2.players.map((p) => ({
          id: p.id,
          name: p.name,
          time: p.time
        })),
        clockHard: game2.clockHard,
        toMove: game2.toMove,
        lastMoveTime: game2.lastMoveTime,
        variants: game2.variants
      }, {
        client: ddbDocClient2,
        tableName: process.env.ABSTRACT_PLAY_TABLE,
        timeloss
      });
      if (timeoutResult.processed) {
        const refreshed = await ddbDocClient2.send(
          new GetCommand12({
            TableName: process.env.ABSTRACT_PLAY_TABLE,
            Key: {
              pk: "GAME",
              sk: `${pars.metaGame}#0#${pars.id}`
            }
          })
        );
        if (refreshed.Item) {
          game2 = hydrateGameState(refreshed.Item);
        } else {
          const completed = await ddbDocClient2.send(
            new GetCommand12({
              TableName: process.env.ABSTRACT_PLAY_TABLE,
              Key: {
                pk: "GAME",
                sk: `${pars.metaGame}#1#${pars.id}`
              }
            })
          );
          if (completed.Item) {
            game2 = hydrateGameState(completed.Item);
          }
        }
      }
    }
    if (userid !== void 0 && userid !== null && userid !== "") {
      await setSeenTime(userid, pars.id);
    }
    const flags = gameinfo3.get(game2.metaGame).flags;
    if (flags !== void 0 && flags.includes("simultaneous") && game2.partialMove !== void 0) {
      const players = game2.players;
      game2.partialMove = game2.partialMove.split(",").map((m, i) => players[i].id === userid ? m : "").join(",");
    }
    const noteData = await getNote;
    console.log(`Fetched notes:
${JSON.stringify(noteData)}`);
    if (noteData.Item !== void 0 && noteData.Item.note) {
      game2.note = noteData.Item.note;
    }
    let comments = [];
    const commentData = await getComments;
    if (commentData.Item !== void 0 && commentData.Item.comments)
      comments = commentData.Item.comments;
    if (game2.gameEnded === void 0) {
      const engine = GameFactory7(game2.metaGame, game2.state);
      if (engine === void 0) {
        throw new Error(`Could not rehydrate the state for id "${pars.id}", cbit "${pars.cbit}", meta "${pars.metaGame}".`);
      }
      if (!engine.gameover) {
        let player;
        const pidx = game2.players.findIndex((p) => p.id === userid);
        if (pidx >= 0) {
          player = pidx + 1;
        }
        game2.state = engine.serialize({ strip: true, player });
      }
    }
    const watchCount = await watchCountWork;
    console.log(`Returning 200.`);
    return {
      statusCode: 200,
      body: JSON.stringify({ "game": game2, "comments": comments, "watchCount": watchCount }),
      headers
    };
  } catch (error2) {
    logGetItemError(error2);
    return formatReturnError(`Unable to get ${pars.metaGame} game ${pars.id}, completed bit ${pars.cbit} from DB`);
  }
}
async function listPlaygroundSavesAuth(userId) {
  try {
    const saves = await listPlaygroundSaves(
      ddbDocClient2,
      process.env.ABSTRACT_PLAY_TABLE,
      userId
    );
    return {
      statusCode: 200,
      body: JSON.stringify(saves),
      headers
    };
  } catch (error2) {
    logGetItemError(error2);
    return formatReturnError(`Unable to list playground saves for ${userId}`);
  }
}
async function getPlaygroundSaveAuth(userId, pars) {
  if (!pars?.id) {
    return formatReturnError("id is required.");
  }
  try {
    const save = await getPlaygroundSave(
      ddbDocClient2,
      process.env.ABSTRACT_PLAY_TABLE,
      userId,
      pars.id
    );
    if (save === void 0) {
      return {
        statusCode: 404,
        body: JSON.stringify({ message: "Playground save not found." }),
        headers
      };
    }
    return {
      statusCode: 200,
      body: JSON.stringify(save),
      headers
    };
  } catch (error2) {
    logGetItemError(error2);
    return formatReturnError(`Unable to get playground save ${pars.id}`);
  }
}
async function createPlaygroundSaveAuth(userId, pars) {
  const validated = validatePlaygroundSaveInput(pars);
  if (!validated.ok) {
    return formatReturnError(validated.message);
  }
  const id = v4_default();
  try {
    const record = await putPlaygroundSave(
      ddbDocClient2,
      process.env.ABSTRACT_PLAY_TABLE,
      userId,
      id,
      validated.data
    );
    return {
      statusCode: 200,
      body: JSON.stringify(record),
      headers
    };
  } catch (error2) {
    logGetItemError(error2);
    return formatReturnError(`Unable to create playground save for ${userId}: ${error2}`);
  }
}
async function savePlaygroundSaveAuth(userId, pars) {
  if (!pars?.id) {
    return formatReturnError("id is required.");
  }
  const validated = validatePlaygroundSaveInput(pars);
  if (!validated.ok) {
    return formatReturnError(validated.message);
  }
  try {
    const existing = await getPlaygroundSave(
      ddbDocClient2,
      process.env.ABSTRACT_PLAY_TABLE,
      userId,
      pars.id
    );
    if (existing === void 0) {
      return {
        statusCode: 404,
        body: JSON.stringify({ message: "Playground save not found." }),
        headers
      };
    }
    const record = await putPlaygroundSave(
      ddbDocClient2,
      process.env.ABSTRACT_PLAY_TABLE,
      userId,
      pars.id,
      validated.data
    );
    return {
      statusCode: 200,
      body: JSON.stringify(record),
      headers
    };
  } catch (error2) {
    logGetItemError(error2);
    return formatReturnError(`Unable to save playground save ${pars.id}: ${error2}`);
  }
}
async function deletePlaygroundSaveAuth(userId, pars) {
  if (!pars?.id) {
    return formatReturnError("id is required.");
  }
  try {
    const existing = await getPlaygroundSave(
      ddbDocClient2,
      process.env.ABSTRACT_PLAY_TABLE,
      userId,
      pars.id
    );
    if (existing === void 0) {
      return {
        statusCode: 404,
        body: JSON.stringify({ message: "Playground save not found." }),
        headers
      };
    }
    await deletePlaygroundSave(
      ddbDocClient2,
      process.env.ABSTRACT_PLAY_TABLE,
      userId,
      pars.id
    );
    return {
      statusCode: 200,
      headers
    };
  } catch (error2) {
    logGetItemError(error2);
    return formatReturnError(`Unable to delete playground save ${pars.id}`);
  }
}
function markResultResponse(result, successBody) {
  if (!result.ok) {
    return formatReturnError(result.message);
  }
  return {
    statusCode: 200,
    body: JSON.stringify(successBody ?? { message: "Success" }),
    headers
  };
}
async function logRecommendationEventAuth(userId, pars) {
  try {
    const result = await logRecommendationEvent(
      ddbDocClient2,
      process.env.ABSTRACT_PLAY_TABLE,
      userId,
      pars
    );
    if (!result.ok) {
      return formatReturnError(result.message);
    }
    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true }),
      headers
    };
  } catch (error2) {
    logGetItemError(error2);
    return formatReturnError(`Unable to log recommendation event for ${userId}`);
  }
}
async function logLayoutFeedbackEventAuth(userId, pars) {
  try {
    const result = await logLayoutFeedbackEvent(
      ddbDocClient2,
      process.env.ABSTRACT_PLAY_TABLE,
      userId,
      pars
    );
    if (!result.ok) {
      return formatReturnError(result.message);
    }
    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true }),
      headers
    };
  } catch (error2) {
    logGetItemError(error2);
    return formatReturnError(`Unable to log layout feedback event for ${userId}`);
  }
}
function parseGameMarkPars(pars) {
  if (!pars?.metaGame || !pars?.id) {
    return void 0;
  }
  return { metaGame: pars.metaGame, id: pars.id };
}
async function watchGameAuth(userId, pars) {
  const parsed = parseGameMarkPars(pars);
  if (parsed === void 0) {
    return formatReturnError("metaGame and id are required.");
  }
  try {
    const result = await watchGame(
      ddbDocClient2,
      process.env.ABSTRACT_PLAY_TABLE,
      userId,
      parsed.metaGame,
      parsed.id
    );
    if (!result.ok) {
      return markResultResponse(result);
    }
    const watchedGames = await listWatchedGames(ddbDocClient2, process.env.ABSTRACT_PLAY_TABLE, userId);
    return markResultResponse(result, watchedGames);
  } catch (error2) {
    logGetItemError(error2);
    return formatReturnError(`Unable to watch game ${parsed.id}`);
  }
}
async function unwatchGameAuth(userId, pars) {
  const parsed = parseGameMarkPars(pars);
  if (parsed === void 0) {
    return formatReturnError("metaGame and id are required.");
  }
  try {
    const result = await unwatchGame(
      ddbDocClient2,
      process.env.ABSTRACT_PLAY_TABLE,
      userId,
      parsed.id
    );
    if (!result.ok) {
      return markResultResponse(result);
    }
    const watchedGames = await listWatchedGames(ddbDocClient2, process.env.ABSTRACT_PLAY_TABLE, userId);
    return markResultResponse(result, watchedGames);
  } catch (error2) {
    logGetItemError(error2);
    return formatReturnError(`Unable to unwatch game ${parsed.id}`);
  }
}
async function highlightGameAuth(userId, pars) {
  const parsed = parseGameMarkPars(pars);
  if (parsed === void 0) {
    return formatReturnError("metaGame and id are required.");
  }
  try {
    const result = await highlightGame(
      ddbDocClient2,
      process.env.ABSTRACT_PLAY_TABLE,
      userId,
      parsed.metaGame,
      parsed.id
    );
    if (!result.ok) {
      return markResultResponse(result);
    }
    const highlights = await listHighlights(ddbDocClient2, process.env.ABSTRACT_PLAY_TABLE, userId);
    return markResultResponse(result, highlights);
  } catch (error2) {
    logGetItemError(error2);
    return formatReturnError(`Unable to highlight game ${parsed.id}`);
  }
}
async function unhighlightGameAuth(userId, pars) {
  const parsed = parseGameMarkPars(pars);
  if (parsed === void 0) {
    return formatReturnError("metaGame and id are required.");
  }
  try {
    const result = await unhighlightGame(
      ddbDocClient2,
      process.env.ABSTRACT_PLAY_TABLE,
      userId,
      parsed.metaGame,
      parsed.id
    );
    if (!result.ok) {
      return markResultResponse(result);
    }
    const highlights = await listHighlights(ddbDocClient2, process.env.ABSTRACT_PLAY_TABLE, userId);
    return markResultResponse(result, highlights);
  } catch (error2) {
    logGetItemError(error2);
    return formatReturnError(`Unable to unhighlight game ${parsed.id}`);
  }
}
async function recommendGameAuth(userId, pars) {
  const parsed = parseGameMarkPars(pars);
  if (parsed === void 0) {
    return formatReturnError("metaGame and id are required.");
  }
  try {
    const result = await recommendGame(
      ddbDocClient2,
      process.env.ABSTRACT_PLAY_TABLE,
      userId,
      parsed.metaGame,
      parsed.id
    );
    if (!result.ok) {
      return markResultResponse(result);
    }
    const representatives = await listUserRecommendations(ddbDocClient2, process.env.ABSTRACT_PLAY_TABLE, userId);
    return markResultResponse(result, representatives);
  } catch (error2) {
    logGetItemError(error2);
    return formatReturnError(`Unable to recommend game ${parsed.id}`);
  }
}
async function unrecommendGameAuth(userId, pars) {
  const parsed = parseGameMarkPars(pars);
  if (parsed === void 0) {
    return formatReturnError("metaGame and id are required.");
  }
  try {
    const result = await unrecommendGame(
      ddbDocClient2,
      process.env.ABSTRACT_PLAY_TABLE,
      userId,
      parsed.metaGame,
      parsed.id
    );
    if (!result.ok) {
      return markResultResponse(result);
    }
    const representatives = await listUserRecommendations(ddbDocClient2, process.env.ABSTRACT_PLAY_TABLE, userId);
    return markResultResponse(result, representatives);
  } catch (error2) {
    logGetItemError(error2);
    return formatReturnError(`Unable to unrecommend game ${parsed.id}`);
  }
}
async function playerHighlights(pars) {
  if (!pars?.userId) {
    return formatReturnError("userId is required.");
  }
  try {
    const highlights = await listHighlights(ddbDocClient2, process.env.ABSTRACT_PLAY_TABLE, pars.userId);
    return {
      statusCode: 200,
      body: JSON.stringify(highlights),
      headers
    };
  } catch (error2) {
    logGetItemError(error2);
    return formatReturnError(`Unable to get highlights for ${pars.userId}`);
  }
}
async function playerAbout(pars) {
  if (!pars?.userId) {
    return formatReturnError("userId is required.");
  }
  try {
    const tableName2 = process.env.ABSTRACT_PLAY_TABLE;
    const userData = await ddbDocClient2.send(new GetCommand12({
      TableName: tableName2,
      Key: { pk: "USERS", sk: pars.userId },
      ProjectionExpression: "about"
    }));
    const userAbout = userData.Item?.about;
    if (typeof userAbout === "string" && userAbout.trim() !== "") {
      return {
        statusCode: 200,
        body: JSON.stringify({ about: userAbout }),
        headers
      };
    }
    const botData = await ddbDocClient2.send(new GetCommand12({
      TableName: tableName2,
      Key: { pk: "BOT", sk: pars.userId },
      ProjectionExpression: "description"
    }));
    const botAbout = botData.Item?.description;
    if (typeof botAbout === "string" && botAbout.trim() !== "") {
      return {
        statusCode: 200,
        body: JSON.stringify({ about: botAbout }),
        headers
      };
    }
    return {
      statusCode: 200,
      body: JSON.stringify({}),
      headers
    };
  } catch (error2) {
    logGetItemError(error2);
    return formatReturnError(`Unable to get about text for ${pars.userId}`);
  }
}
async function representativeGames(pars) {
  if (!pars?.metaGame) {
    return formatReturnError("metaGame is required.");
  }
  try {
    const games2 = await listMetaGameRecommendations(ddbDocClient2, process.env.ABSTRACT_PLAY_TABLE, pars.metaGame);
    return {
      statusCode: 200,
      body: JSON.stringify(games2),
      headers
    };
  } catch (error2) {
    logGetItemError(error2);
    return formatReturnError(`Unable to get representative games for ${pars.metaGame}`);
  }
}
async function toggleStar(userid, pars) {
  try {
    const player = (await getPlayers([userid]))[0];
    let delta = 0;
    if (player.stars === void 0) {
      player.stars = [];
    }
    if (!player.stars.includes(pars.metaGame)) {
      delta = 1;
      player.stars.push(pars.metaGame);
    } else {
      delta = -1;
      const idx = player.stars.findIndex((m) => m === pars.metaGame);
      player.stars.splice(idx, 1);
    }
    const list = [];
    list.push(
      ddbDocClient2.send(new UpdateCommand10({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: { "pk": "USER", "sk": player.id },
        ExpressionAttributeValues: { ":ss": player.stars },
        UpdateExpression: "set stars = :ss"
      }))
    );
    list.push(
      ddbDocClient2.send(new UpdateCommand10({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: { "pk": "USERS", "sk": player.id },
        ExpressionAttributeValues: { ":ss": player.stars },
        UpdateExpression: "set stars = :ss"
      }))
    );
    console.log(`Queued update to player ${player.id}, ${player.name}, toggling star for ${pars.metaGame}: ${delta}`);
    await ensureMetaGameCountEntry(pars.metaGame);
    list.push(adjustShardedCounts(
      ddbDocClient2,
      process.env.ABSTRACT_PLAY_TABLE,
      pars.metaGame,
      { stars: delta }
    ));
    console.log("Running queued updates");
    await Promise.all(list);
    console.log("Done");
    return {
      statusCode: 200,
      body: JSON.stringify(player.stars),
      headers
    };
  } catch (error2) {
    logGetItemError(error2);
    return formatReturnError(`Unable to toggle star for ${userid}, ${pars.metaGame} from table ${process.env.ABSTRACT_PLAY_TABLE}`);
  }
}
async function injectState(userid, pars) {
  try {
    const user = await ddbDocClient2.send(
      new GetCommand12({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "USER",
          "sk": userid
        }
      })
    );
    if (user.Item === void 0 || user.Item.admin !== true) {
      return {
        statusCode: 200,
        body: JSON.stringify({}),
        headers
      };
    }
  } catch (err) {
    logGetItemError(err);
    return formatReturnError(`Unable to inject state ${userid}`);
  }
  let game2;
  try {
    const getGame = ddbDocClient2.send(
      new GetCommand12({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "GAME",
          "sk": pars.metaGame + "#0#" + pars.id
        }
      })
    );
    const gameData = await getGame;
    console.log("Got:");
    console.log(gameData);
    game2 = hydrateGameState(gameData.Item);
    if (game2 === void 0) {
      throw new Error(`Game ${pars.id} not found`);
    }
  } catch (error2) {
    logGetItemError(error2);
    return formatReturnError(`Unable to get game ${pars.id} from table ${process.env.ABSTRACT_PLAY_TABLE}`);
  }
  game2.state = pars.newState;
  try {
    await ddbDocClient2.send(new PutCommand10({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Item: prepareGameStateForStorage(game2)
    }));
  } catch (error2) {
    logGetItemError(error2);
    return formatReturnError(`Unable to update game ${pars.id} from table ${process.env.ABSTRACT_PLAY_TABLE}`);
  }
  return {
    statusCode: 200,
    body: JSON.stringify(game2),
    headers
  };
}
async function updateGameSettings(userid, pars) {
  if (pars.cbit !== 0 && pars.cbit !== 1) {
    return formatReturnError("cbit must be 0 or 1");
  }
  try {
    const data = await ddbDocClient2.send(
      new GetCommand12({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "GAME",
          "sk": pars.metaGame + "#" + pars.cbit + "#" + pars.game
        }
      })
    );
    console.log("Got:");
    console.log(data);
    const game2 = hydrateGameState(data.Item);
    if (game2 === void 0)
      throw new Error(`updateGameSettings: game ${pars.game} not found`);
    const player = game2.players.find((p) => p.id === userid);
    if (player === void 0)
      throw new Error(`updateGameSettings: player ${userid} isn't playing in game ${pars.game}`);
    player.settings = pars.settings;
    try {
      await ddbDocClient2.send(new PutCommand10({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Item: prepareGameStateForStorage(game2)
      }));
    } catch (error2) {
      logGetItemError(error2);
      return formatReturnError(`Unable to update game ${pars.game} from table ${process.env.ABSTRACT_PLAY_TABLE}`);
    }
    return {
      statusCode: 200,
      headers
    };
  } catch (error2) {
    logGetItemError(error2);
    return formatReturnError(`Unable to get or update game ${pars.game} from table ${process.env.ABSTRACT_PLAY_TABLE}`);
  }
}
async function setSeenTime(userid, gameid) {
  const tableName2 = process.env.ABSTRACT_PLAY_TABLE;
  let user;
  try {
    const userData = await ddbDocClient2.send(
      new GetCommand12({
        TableName: tableName2,
        Key: {
          "pk": "USER",
          "sk": userid
        }
      })
    );
    if (userData.Item === void 0)
      throw new Error(`setSeenTime, no user?? ${userid}`);
    user = userData.Item;
  } catch (err) {
    logGetItemError(err);
    throw new Error(`setSeenTime, no user?? ${userid}`);
  }
  const mayWriteOverlay = await shouldWriteGameOpenOverlay(
    ddbDocClient2,
    tableName2,
    userid,
    gameid
  );
  if (!mayWriteOverlay) {
    return;
  }
  const now = Date.now();
  await upsertUserGameOverlay(
    ddbDocClient2,
    tableName2,
    userid,
    gameid,
    { seen: now }
  );
}
async function dismissNotificationAuth(userid, pars) {
  if (!pars.sk) {
    return formatReturnError("sk is required");
  }
  const tableName2 = process.env.ABSTRACT_PLAY_TABLE;
  try {
    const deleted = await dismissNotification(ddbDocClient2, tableName2, userid, pars.sk);
    if (!deleted) {
      return formatReturnError("Notification not found");
    }
    return {
      statusCode: 200,
      body: JSON.stringify({ success: true }),
      headers
    };
  } catch (err) {
    logGetItemError(err);
    return formatReturnError(`Unable to dismiss notification for ${userid}`);
  }
}
async function updateUserSettings(userid, pars) {
  try {
    await ddbDocClient2.send(new UpdateCommand10({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: { "pk": "USER", "sk": userid },
      ExpressionAttributeValues: { ":ss": pars.settings },
      UpdateExpression: "set settings = :ss"
    }));
    console.log("Success - user settings updated");
    return {
      statusCode: 200,
      body: JSON.stringify({
        message: `Sucessfully stored user settings for user ${userid}`
      }),
      headers
    };
  } catch (err) {
    logGetItemError(err);
    return formatReturnError(`Unable to store user settings for user ${userid}`);
  }
}
function mapBotNameError(error2) {
  if (error2 instanceof BotNameTakenError) {
    return {
      statusCode: 409,
      body: JSON.stringify({ message: error2.message }),
      headers
    };
  }
  if (error2 instanceof BotNameValidationError) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: error2.message }),
      headers
    };
  }
  return void 0;
}
async function createBot(claim, pars) {
  if (!claim || !claim.sub) {
    return {
      statusCode: 401,
      body: JSON.stringify({ message: "Unauthorized" }),
      headers
    };
  }
  let displayName;
  try {
    displayName = validateBotDisplayName(pars?.name ?? "");
  } catch (error2) {
    const mapped = mapBotNameError(error2);
    if (mapped) {
      return mapped;
    }
    throw error2;
  }
  const endpoint = pars?.endpoint?.trim();
  if (!endpoint) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: "An HTTPS endpoint is required for the bot" }),
      headers
    };
  }
  const userPoolId = process.env.BOTPOOL_ID;
  if (!userPoolId) {
    return formatReturnError("BOTPOOL_ID environment variable is not set");
  }
  let clientId;
  let nameReserved = false;
  try {
    const response = await cognitoClient2.send(new CreateUserPoolClientCommand(
      buildCreateBotClientInput(userPoolId, `bot-${v4_default()}`)
    ));
    clientId = response.UserPoolClient?.ClientId;
    const clientSecret = response.UserPoolClient?.ClientSecret;
    if (!clientId || !clientSecret) {
      throw new Error("Cognito did not return ClientId or ClientSecret");
    }
    displayName = await reserveBotDisplayName(displayName, clientId, claim.sub);
    nameReserved = true;
    await ddbDocClient2.send(new PutCommand10({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Item: {
        pk: "BOT",
        sk: clientId,
        name: displayName,
        endpoint,
        lastseen: Date.now(),
        owner: claim.sub
      }
    }));
    await ddbDocClient2.send(new UpdateCommand10({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: { "pk": "USER", "sk": claim.sub },
      ExpressionAttributeNames: { "#b": "bots" },
      ExpressionAttributeValues: { ":b": /* @__PURE__ */ new Set([clientId]) },
      UpdateExpression: "ADD #b :b"
    }));
    return {
      statusCode: 200,
      body: JSON.stringify({ clientId, clientSecret }),
      headers
    };
  } catch (error2) {
    console.error("Error creating bot: ", error2);
    if (nameReserved) {
      try {
        await releaseBotDisplayName(displayName);
      } catch (releaseError) {
        console.error("Error releasing bot name reservation after failed create: ", releaseError);
      }
    }
    if (clientId) {
      try {
        await cognitoClient2.send(new DeleteUserPoolClientCommand({
          UserPoolId: userPoolId,
          ClientId: clientId
        }));
      } catch (deleteError) {
        console.error("Error deleting Cognito client after failed create: ", deleteError);
      }
    }
    const mapped = mapBotNameError(error2);
    if (mapped) {
      return mapped;
    }
    return formatReturnError(`Unable to create bot: ${error2.message || error2}`);
  }
}
async function updateBot(claim, pars) {
  if (!claim || !claim.sub) {
    return {
      statusCode: 401,
      body: JSON.stringify({ message: "Unauthorized" }),
      headers
    };
  }
  const clientId = pars?.clientId;
  if (!clientId || clientId.trim().length === 0) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: "A clientId is required to identify the bot" }),
      headers
    };
  }
  try {
    const data = await ddbDocClient2.send(new GetCommand12({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: {
        pk: "BOT",
        sk: clientId
      }
    }));
    if (!data.Item) {
      return {
        statusCode: 404,
        body: JSON.stringify({ message: `Bot with client ID ${clientId} not found` }),
        headers
      };
    }
    const bot = data.Item;
    if (bot.owner !== claim.sub) {
      return {
        statusCode: 403,
        body: JSON.stringify({ message: "You are not the owner of this bot" }),
        headers
      };
    }
    if (pars.name !== void 0) {
      bot.name = await renameBotDisplayName(
        bot.name,
        pars.name,
        clientId,
        claim.sub
      );
    }
    if (pars.endpoint !== void 0) {
      const trimmedEndpoint = pars.endpoint.trim();
      if (!trimmedEndpoint) {
        return {
          statusCode: 400,
          body: JSON.stringify({ message: "An HTTPS endpoint is required for the bot" }),
          headers
        };
      }
      bot.endpoint = trimmedEndpoint;
    }
    if (pars.description !== void 0) {
      const validated = validateAboutText(pars.description);
      if (!validated.ok) {
        return {
          statusCode: 400,
          body: JSON.stringify({ message: validated.message }),
          headers
        };
      }
      const previousDescription = typeof bot.description === "string" ? bot.description : void 0;
      const saveState = await loadAboutSaveState(claim.sub);
      const saveCheck = checkAboutSaveAllowed(
        previousDescription,
        validated.text,
        saveState
      );
      if (!saveCheck.ok) {
        return {
          statusCode: 400,
          body: JSON.stringify({ message: saveCheck.message }),
          headers
        };
      }
      bot.description = validated.text;
      if (!saveCheck.skip) {
        await ddbDocClient2.send(new UpdateCommand10({
          TableName: process.env.ABSTRACT_PLAY_TABLE,
          Key: { pk: "USER", sk: claim.sub },
          ExpressionAttributeValues: {
            ":day": saveCheck.aboutSaveDay,
            ":count": saveCheck.aboutSaveCount
          },
          ExpressionAttributeNames: {
            "#day": "aboutSaveDay",
            "#count": "aboutSaveCount"
          },
          UpdateExpression: "set #day = :day, #count = :count"
        }));
      }
    }
    if (pars.supported !== void 0) {
      if (!Array.isArray(pars.supported)) {
        return {
          statusCode: 400,
          body: JSON.stringify({ message: "supported must be an array of objects matching {meta: string, variants: string[]}" }),
          headers
        };
      }
      for (const entry of pars.supported) {
        const variantErr = validateChallengeVariantUids(entry.meta, entry.variants);
        if (variantErr) {
          return variantErr;
        }
      }
      bot.supported = pars.supported;
    }
    await ddbDocClient2.send(new PutCommand10({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Item: bot
    }));
    return {
      statusCode: 200,
      body: JSON.stringify({ message: "Bot updated successfully" }),
      headers
    };
  } catch (error2) {
    console.error("Error updating bot: ", error2);
    const mapped = mapBotNameError(error2);
    if (mapped) {
      return mapped;
    }
    return formatReturnError(`Unable to update bot: ${error2.message || error2}`);
  }
}
function mapCognitoBotSecretError(error2, action) {
  const name = error2?.name ?? error2?.__type;
  if (name === "InvalidParameterException") {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: error2.message || "Invalid parameter" }),
      headers
    };
  }
  if (name === "LimitExceededException") {
    return {
      statusCode: 409,
      body: JSON.stringify({ message: error2.message || "Secret limit exceeded" }),
      headers
    };
  }
  return formatReturnError(`Unable to ${action}: ${error2.message || error2}`);
}
async function loadOwnedBot(claim, clientId) {
  if (!claim || !claim.sub) {
    return {
      response: {
        statusCode: 401,
        body: JSON.stringify({ message: "Unauthorized" }),
        headers
      }
    };
  }
  if (!clientId || clientId.trim().length === 0) {
    return {
      response: {
        statusCode: 400,
        body: JSON.stringify({ message: "A clientId is required to identify the bot" }),
        headers
      }
    };
  }
  try {
    const data = await ddbDocClient2.send(new GetCommand12({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: {
        pk: "BOT",
        sk: clientId
      }
    }));
    if (!data.Item) {
      return {
        response: {
          statusCode: 404,
          body: JSON.stringify({ message: `Bot with client ID ${clientId} not found` }),
          headers
        }
      };
    }
    const bot = data.Item;
    if (bot.owner !== claim.sub) {
      return {
        response: {
          statusCode: 403,
          body: JSON.stringify({ message: "You are not the owner of this bot" }),
          headers
        }
      };
    }
    return { bot };
  } catch (error2) {
    console.error("Error loading bot: ", error2);
    return { response: formatReturnError(`Unable to load bot: ${error2.message || error2}`) };
  }
}
async function beginBotSecretRotation2(claim, pars) {
  const loaded = await loadOwnedBot(claim, pars?.clientId);
  if ("response" in loaded) {
    return loaded.response;
  }
  const clientId = loaded.bot.sk;
  try {
    const { clientSecretId, clientSecret } = await beginBotSecretRotation(clientId);
    const pendingSecretCreatedAt = Date.now();
    await ddbDocClient2.send(new UpdateCommand10({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: { pk: "BOT", sk: clientId },
      UpdateExpression: "SET pendingSecretId = :pendingSecretId, pendingSecretCreatedAt = :pendingSecretCreatedAt",
      ExpressionAttributeValues: {
        ":pendingSecretId": clientSecretId,
        ":pendingSecretCreatedAt": pendingSecretCreatedAt
      }
    }));
    return {
      statusCode: 200,
      body: JSON.stringify({
        clientSecretId,
        clientSecret,
        secretRotationPending: true,
        pendingSecretId: clientSecretId,
        pendingSecretCreatedAt
      }),
      headers
    };
  } catch (error2) {
    console.error("Error beginning bot secret rotation: ", error2);
    if (error2.message === "No client secrets found") {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: error2.message }),
        headers
      };
    }
    return mapCognitoBotSecretError(error2, "begin bot secret rotation");
  }
}
async function finalizeBotSecretRotation2(claim, pars) {
  const loaded = await loadOwnedBot(claim, pars?.clientId);
  if ("response" in loaded) {
    return loaded.response;
  }
  const clientId = loaded.bot.sk;
  try {
    await finalizeBotSecretRotation(clientId);
    await ddbDocClient2.send(new UpdateCommand10({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: { pk: "BOT", sk: clientId },
      UpdateExpression: "REMOVE pendingSecretId, pendingSecretCreatedAt"
    }));
    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "Bot secret rotation finalized successfully",
        secretRotationPending: false
      }),
      headers
    };
  } catch (error2) {
    console.error("Error finalizing bot secret rotation: ", error2);
    if (error2.message === "No secret rotation in progress") {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: error2.message }),
        headers
      };
    }
    return mapCognitoBotSecretError(error2, "finalize bot secret rotation");
  }
}
async function deleteBot(claim, pars) {
  if (!claim || !claim.sub) {
    return {
      statusCode: 401,
      body: JSON.stringify({ message: "Unauthorized" }),
      headers
    };
  }
  const clientId = pars?.clientId;
  if (!clientId || clientId.trim().length === 0) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: "A clientId is required to identify the bot to delete" }),
      headers
    };
  }
  try {
    const data = await ddbDocClient2.send(new GetCommand12({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: {
        pk: "BOT",
        sk: clientId
      }
    }));
    if (!data.Item) {
      return {
        statusCode: 404,
        body: JSON.stringify({ message: `Bot with client ID ${clientId} not found` }),
        headers
      };
    }
    const bot = data.Item;
    if (bot.owner !== claim.sub) {
      return {
        statusCode: 403,
        body: JSON.stringify({ message: "You are not the owner of this bot" }),
        headers
      };
    }
    const userPoolId = process.env.BOTPOOL_ID;
    if (!userPoolId) {
      throw new Error("BOTPOOL_ID environment variable is not set");
    }
    const command = new DeleteUserPoolClientCommand({
      UserPoolId: userPoolId,
      ClientId: clientId
    });
    await cognitoClient2.send(command);
    try {
      await releaseBotDisplayName(bot.name);
    } catch (releaseError) {
      console.error(`Error releasing bot name for ${clientId}:`, releaseError);
    }
    await ddbDocClient2.send(new DeleteCommand9({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: {
        pk: "BOT",
        sk: clientId
      }
    }));
    await ddbDocClient2.send(new UpdateCommand10({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: { "pk": "USER", "sk": claim.sub },
      ExpressionAttributeNames: { "#b": "bots" },
      UpdateExpression: "DELETE #b :b",
      ExpressionAttributeValues: { ":b": /* @__PURE__ */ new Set([clientId]) }
    }));
    return {
      statusCode: 200,
      body: JSON.stringify({ message: "Bot deleted successfully" }),
      headers
    };
  } catch (error2) {
    console.error("Error deleting bot: ", error2);
    const mapped = mapBotNameError(error2);
    if (mapped) {
      return mapped;
    }
    return formatReturnError(`Unable to delete bot: ${error2.message || error2}`);
  }
}
async function loadMeUser(claim) {
  const userId = claim.sub;
  const email = claim.email;
  if (!email || email.trim().length === 0) {
    console.log(`How!?: claim.email is ${email}`);
  }
  console.log("Getting USER record");
  const userData = await ddbDocClient2.send(
    new GetCommand12({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: {
        pk: "USER",
        sk: userId
      }
    })
  );
  if (userData.Item === void 0) {
    return void 0;
  }
  const user = userData.Item;
  if (user.email !== email) {
    await updateUserEMail(claim);
  }
  return user;
}
async function clearUserCleanedFlag(userId, user) {
  if (user.cleaned !== true) {
    return;
  }
  await ddbDocClient2.send(new UpdateCommand10({
    TableName: process.env.ABSTRACT_PLAY_TABLE,
    Key: { pk: "USER", sk: userId },
    UpdateExpression: "REMOVE cleaned"
  }));
  delete user.cleaned;
}
async function resolveMeAncillary(userId, user) {
  const tableName2 = process.env.ABSTRACT_PLAY_TABLE;
  const tagWork = ddbDocClient2.send(
    new GetCommand12({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: { pk: "TAG", sk: userId }
    })
  );
  const paletteWork = ddbDocClient2.send(
    new GetCommand12({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: { pk: "PALETTES", sk: userId }
    })
  );
  const standingWork = ddbDocClient2.send(
    new GetCommand12({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: { pk: "REALSTANDING", sk: userId }
    })
  );
  const customizationWork = ddbDocClient2.send(
    new QueryCommand9({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      KeyConditionExpression: "#pk = :pk",
      ExpressionAttributeValues: { ":pk": `CUSTOMIZATION#${userId}` },
      ExpressionAttributeNames: { "#pk": "pk" }
    })
  );
  const botIds = Array.from(user?.bots ?? /* @__PURE__ */ new Set());
  const [
    tagData,
    paletteData,
    standingData,
    customizationData,
    botData,
    blocked,
    watchedGames,
    highlights,
    representatives
  ] = await Promise.all([
    tagWork,
    paletteWork,
    standingWork,
    customizationWork,
    getBots(botIds),
    getPlayerRelationIds(userId, "BLOCKED#"),
    listWatchedGames(ddbDocClient2, tableName2, userId),
    listHighlights(ddbDocClient2, tableName2, userId),
    listUserRecommendations(ddbDocClient2, tableName2, userId)
  ]);
  let tags = [];
  if (tagData.Item !== void 0) {
    tags = tagData.Item.tags;
  }
  let palettes = [];
  if (paletteData.Item !== void 0) {
    palettes = paletteData.Item.palettes;
  }
  let realStanding = [];
  if (standingData.Item !== void 0) {
    realStanding = standingData.Item.standing;
  }
  const customizations = {};
  if (customizationData.Items !== void 0) {
    for (const item of customizationData.Items) {
      const settings = item.settings;
      if (typeof settings === "string") {
        customizations[item.sk] = JSON.parse(settings);
      } else {
        customizations[item.sk] = settings;
      }
    }
  }
  const bots = botData.map((d) => toClientBot(d.Item)).filter((bot) => bot !== void 0);
  return {
    tags,
    palettes,
    realStanding,
    customizations,
    bots,
    blocked,
    watchedGames,
    highlights,
    representatives
  };
}
async function resolveMeChallenges(user) {
  const challengesIssuedIDs = Array.from(user?.challenges_issued ?? /* @__PURE__ */ new Set());
  const challengesReceivedIDs = Array.from(user?.challenges_received ?? /* @__PURE__ */ new Set());
  const challengesAcceptedIDs = Array.from(user?.challenges_accepted ?? /* @__PURE__ */ new Set());
  const standingChallengeIDs = Array.from(user?.challenges_standing ?? /* @__PURE__ */ new Set());
  const [
    challengesIssued,
    challengesReceived,
    challengesAccepted,
    standingChallenges2
  ] = await Promise.all([
    getChallenges(challengesIssuedIDs),
    getChallenges(challengesReceivedIDs),
    getChallenges(challengesAcceptedIDs),
    getChallenges(standingChallengeIDs)
  ]);
  return {
    challengesIssued: challengesIssued.map((d) => d.Item),
    challengesReceived: challengesReceived.map((d) => d.Item),
    challengesAccepted: challengesAccepted.map((d) => d.Item),
    standingChallenges: standingChallenges2.map((d) => d.Item)
  };
}
async function meProfile(claim) {
  const userId = claim.sub;
  console.log(`me_profile: user id ${userId}`);
  try {
    const user = await loadMeUser(claim);
    if (user === void 0) {
      return {
        statusCode: 200,
        body: JSON.stringify({}),
        headers
      };
    }
    const tableName2 = process.env.ABSTRACT_PLAY_TABLE;
    const [activeGames, ancillary] = await Promise.all([
      listActiveGameKeys(ddbDocClient2, tableName2, userId),
      resolveMeAncillary(userId, user)
    ]);
    return {
      statusCode: 200,
      body: JSON.stringify(buildMeProfilePayload(user, ancillary, activeGames), Set_toJSON),
      headers
    };
  } catch (err) {
    logGetItemError(err);
    return formatReturnError(`Unable to get profile data for ${userId}`);
  }
}
async function meDashboard(claim, pars) {
  const userId = claim.sub;
  console.log(`me_dashboard: user id ${userId}, vars ${pars?.vars}, update ${pars?.update}`);
  try {
    const user = await loadMeUser(claim);
    if (user === void 0) {
      return {
        statusCode: 200,
        body: JSON.stringify({}),
        headers
      };
    }
    const tableName2 = process.env.ABSTRACT_PLAY_TABLE;
    await clearUserCleanedFlag(userId, user);
    let games2 = await loadDashboardGames(ddbDocClient2, tableName2, userId);
    const maintenance = await runDashboardMaintenance(
      ddbDocClient2,
      tableName2,
      userId,
      games2,
      {
        client: ddbDocClient2,
        tableName: tableName2,
        timeloss
      }
    );
    games2 = maintenance.games;
    if (maintenance.evictedIds.length > 0) {
      console.log(`me_dashboard evicted games for ${user.name}:`, maintenance.evictedIds);
    }
    console.log("Fetching challenges");
    const [ancillary, challenges, notifications] = await Promise.all([
      resolveMeAncillary(userId, user),
      resolveMeChallenges(user),
      loadNotificationsForDashboard(ddbDocClient2, tableName2, userId, { refreshExpiry: true })
    ]);
    console.log(`me_dashboard returning for ${user.name}, id ${user.id} with games`, games2);
    return {
      statusCode: 200,
      body: JSON.stringify(buildMeDashboardPayload(user, ancillary, games2, challenges, notifications), Set_toJSON),
      headers
    };
  } catch (err) {
    logGetItemError(err);
    return formatReturnError(`Unable to get dashboard data for ${userId}`);
  }
}
async function nextGame(userid) {
  try {
    console.log(`Getting USER record`);
    const userData = await ddbDocClient2.send(
      new GetCommand12({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "USER",
          "sk": userid
        }
      })
    );
    if (userData.Item === void 0) {
      return {
        statusCode: 400,
        headers
      };
    }
    const userRec = userData.Item;
    const games2 = await loadDashboardGames(
      ddbDocClient2,
      process.env.ABSTRACT_PLAY_TABLE,
      userid
    );
    const yourturn = [];
    for (const game2 of games2) {
      const thisPlayerIdx = game2.players.findIndex((p) => p.id === userid);
      if (Array.isArray(game2.toMove) && game2.toMove.length > thisPlayerIdx + 1 && game2.toMove[thisPlayerIdx] || game2.toMove === thisPlayerIdx.toString()) {
        const remaining = (game2.players[thisPlayerIdx].time || 0) - (Date.now() - game2.lastMoveTime);
        yourturn.push({ game: game2, remaining });
      }
    }
    yourturn.sort((a, b) => a.remaining - b.remaining);
    console.log(`It is your turn in ${yourturn.length} games.`);
    console.log(`Yourturn results: ${JSON.stringify(yourturn, null, 2)}`);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(yourturn.map((x) => x.game))
    };
  } catch (err) {
    logGetItemError(err);
    return formatReturnError(`Unable to get next game for ${userid}`);
  }
}
async function updateUserEMail(claim) {
  if (claim.email && claim.email.trim().length > 0) {
    console.log(`updateUserEMail: updating email to ${claim.email}`);
    return ddbDocClient2.send(new UpdateCommand10({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: { "pk": "USER", "sk": claim.sub },
      ExpressionAttributeValues: { ":e": claim.email },
      UpdateExpression: "set email = :e"
    }));
  } else {
    console.log(`updateUserEMail: claim.email is ${claim.email}`);
  }
}
async function mySettings(claim) {
  const userId = claim.sub;
  const email = claim.email;
  try {
    const user = await ddbDocClient2.send(
      new GetCommand12({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "USER",
          "sk": userId
        },
        ExpressionAttributeNames: { "#name": "name", "#language": "language" },
        ProjectionExpression: "id,#name,email,#language"
      })
    );
    if (user.Item === void 0)
      throw new Error("mySettings no user ${userId}");
    if (user.Item.email !== email)
      await updateUserEMail(claim);
    console.log("mySettings Item: ", user.Item);
    return {
      statusCode: 200,
      body: JSON.stringify({
        "id": user.Item.id,
        "name": user.Item.name,
        "email": email,
        "language": user.Item.language
      }, Set_toJSON),
      headers
    };
  } catch (err) {
    logGetItemError(err);
    return formatReturnError(`Unable to get user data for ${userId}`);
  }
}
async function loadAboutSaveState(userId) {
  const userData = await ddbDocClient2.send(new GetCommand12({
    TableName: process.env.ABSTRACT_PLAY_TABLE,
    Key: { pk: "USER", sk: userId },
    ProjectionExpression: "aboutSaveDay, aboutSaveCount"
  }));
  return {
    aboutSaveDay: userData.Item?.aboutSaveDay,
    aboutSaveCount: userData.Item?.aboutSaveCount
  };
}
async function saveUserAbout(userId, rawValue) {
  const validated = validateAboutText(rawValue);
  if (!validated.ok) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: validated.message }),
      headers
    };
  }
  const val = validated.text;
  try {
    const tableName2 = process.env.ABSTRACT_PLAY_TABLE;
    const userData = await ddbDocClient2.send(new GetCommand12({
      TableName: tableName2,
      Key: { pk: "USER", sk: userId },
      ProjectionExpression: "about, aboutSaveDay, aboutSaveCount"
    }));
    const userItem = userData.Item ?? {};
    const saveCheck = checkAboutSaveAllowed(
      userItem.about,
      val,
      {
        aboutSaveDay: userItem.aboutSaveDay,
        aboutSaveCount: userItem.aboutSaveCount
      }
    );
    if (!saveCheck.ok) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: saveCheck.message }),
        headers
      };
    }
    const userUpdateValues = { ":v": val };
    const userUpdateNames = { "#a": "about" };
    let userUpdateExpression = "set #a = :v";
    if (!saveCheck.skip) {
      userUpdateValues[":day"] = saveCheck.aboutSaveDay;
      userUpdateValues[":count"] = saveCheck.aboutSaveCount;
      userUpdateNames["#day"] = "aboutSaveDay";
      userUpdateNames["#count"] = "aboutSaveCount";
      userUpdateExpression += ", #day = :day, #count = :count";
    }
    await Promise.all([
      ddbDocClient2.send(new UpdateCommand10({
        TableName: tableName2,
        Key: { pk: "USER", sk: userId },
        ExpressionAttributeValues: userUpdateValues,
        ExpressionAttributeNames: userUpdateNames,
        UpdateExpression: userUpdateExpression
      })),
      ddbDocClient2.send(new UpdateCommand10({
        TableName: tableName2,
        Key: { pk: "USERS", sk: userId },
        ExpressionAttributeValues: { ":v": val },
        ExpressionAttributeNames: { "#a": "about" },
        UpdateExpression: "set #a = :v"
      }))
    ]);
    return {
      statusCode: 200,
      body: JSON.stringify({ result: "success" }, Set_toJSON),
      headers
    };
  } catch (err) {
    logGetItemError(err);
    return formatReturnError(`Unable to update about for ${userId}`);
  }
}
async function newSetting(userId, pars) {
  if (pars.attribute === "about") {
    return await saveUserAbout(userId, pars.value);
  }
  let attr = "";
  let val = "";
  switch (pars.attribute) {
    case "name":
      attr = "name";
      val = pars.value;
      break;
    case "language":
      attr = "language";
      val = pars.value;
      break;
    case "country":
      attr = "country";
      val = pars.value;
      break;
    case "bggid":
      attr = "bggid";
      val = pars.value;
      break;
    default:
      return;
  }
  console.log("attr, val: ", attr, val);
  const work = [];
  work.push(ddbDocClient2.send(new UpdateCommand10({
    TableName: process.env.ABSTRACT_PLAY_TABLE,
    Key: { "pk": "USER", "sk": userId },
    ExpressionAttributeValues: { ":v": val },
    ExpressionAttributeNames: { "#a": attr },
    UpdateExpression: "set #a = :v"
  })));
  if (pars.attribute === "name") {
    work.push(ddbDocClient2.send(new UpdateCommand10({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: { "pk": "USERS", "sk": userId },
      ExpressionAttributeValues: { ":newname": val },
      ExpressionAttributeNames: { "#name": "name" },
      UpdateExpression: "set #name = :newname"
    })));
  }
  if (pars.attribute === "country") {
    work.push(ddbDocClient2.send(new UpdateCommand10({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: { "pk": "USERS", "sk": userId },
      ExpressionAttributeValues: { ":newcountry": val },
      ExpressionAttributeNames: { "#country": "country" },
      UpdateExpression: "set #country = :newcountry"
    })));
  }
  if (attr === "bggid" || attr === "about") {
    console.log(`Pushing USERS update: ${userId} -> ${attr} = ${val}`);
    work.push(ddbDocClient2.send(new UpdateCommand10({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: { "pk": "USERS", "sk": userId },
      ExpressionAttributeValues: { ":v": val },
      ExpressionAttributeNames: { "#a": attr },
      UpdateExpression: "set #a = :v"
    })));
  }
  try {
    await Promise.all(work);
    console.log("attr, val: ", attr, val, " updated");
    return {
      statusCode: 200,
      body: JSON.stringify({
        "result": "success"
      }, Set_toJSON),
      headers
    };
  } catch (err) {
    logGetItemError(err);
  }
}
async function getChallenges(challengeIds) {
  const challenges = [];
  challengeIds.forEach((id) => {
    const ind = id.indexOf("#");
    if (ind > -1) {
      const metaGame = id.substring(0, ind);
      const challengeId = id.substring(ind + 1);
      challenges.push(
        ddbDocClient2.send(
          new GetCommand12({
            TableName: process.env.ABSTRACT_PLAY_TABLE,
            Key: {
              "pk": "STANDINGCHALLENGE#" + metaGame,
              "sk": challengeId
            }
          })
        )
      );
    } else {
      challenges.push(
        ddbDocClient2.send(
          new GetCommand12({
            TableName: process.env.ABSTRACT_PLAY_TABLE,
            Key: {
              "pk": "CHALLENGE",
              "sk": id
            }
          })
        )
      );
    }
  });
  return Promise.all(challenges);
}
async function getBots(botIds) {
  return Promise.all(botIds.map(
    (clientId) => ddbDocClient2.send(
      new GetCommand12({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          pk: "BOT",
          sk: clientId
        }
      })
    )
  ));
}
async function newProfile(claim, pars) {
  const userid = claim.sub;
  const email = claim.email;
  if (!email || email.trim() === "") {
    logGetItemError(`No email for user ${pars.name}, id ${userid} in newProfile`);
    return formatReturnError(`No email for user ${pars.name}, id ${userid} in newProfile`);
  }
  const data = {
    "pk": "USER",
    "sk": userid,
    "id": userid,
    "name": pars.name,
    "email": email,
    "consent": pars.consent,
    "anonymous": pars.anonymous,
    "country": pars.country,
    "tagline": pars.tagline,
    "settings": {
      "all": {
        "annotate": true,
        "color": "standard"
      }
    },
    "publicRivalries": false
  };
  const data2 = {
    "pk": "USERS",
    "sk": userid,
    "name": pars.name,
    "publicRivalries": false
  };
  try {
    const insertUser = ddbDocClient2.send(new PutCommand10({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Item: data
    }));
    const insertIntoUserList = ddbDocClient2.send(new PutCommand10({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Item: data2
    }));
    await Promise.all([insertUser, insertIntoUserList]);
    console.log("Success - user added", data);
    return {
      statusCode: 200,
      body: JSON.stringify({
        message: `Sucessfully stored user profile for user ${pars.name}`
      }),
      headers
    };
  } catch (err) {
    logGetItemError(err);
    return formatReturnError(`Unable to store user profile for user ${pars.name}`);
  }
}
async function setPush(userid, pars) {
  try {
    console.log(`Setting 'mayPush' to ${pars.state} for user ${userid}`);
    await ddbDocClient2.send(
      new UpdateCommand10({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: { "pk": "USER", "sk": userid },
        ExpressionAttributeNames: { "#mp": "mayPush" },
        ExpressionAttributeValues: { ":mp": pars.state },
        UpdateExpression: "set #mp = :mp"
      })
    );
    if (pars.state === false) {
      await deleteAllPushSubscriptions(userid);
    }
  } catch (error2) {
    logGetItemError(error2);
    throw new Error("setPush: Failed to save push preference");
  }
  return {
    statusCode: 200,
    body: JSON.stringify({
      message: `Successfully saved push preference for ${userid}`
    }),
    headers
  };
}
async function setPublicRivalries(userid, pars) {
  try {
    console.log(`Setting 'publicRivalries' to ${pars.state} for user ${userid}`);
    const update = {
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      ExpressionAttributeNames: { "#pr": "publicRivalries" },
      ExpressionAttributeValues: { ":pr": pars.state },
      UpdateExpression: "set #pr = :pr"
    };
    await Promise.all([
      ddbDocClient2.send(
        new UpdateCommand10({
          ...update,
          Key: { "pk": "USER", "sk": userid }
        })
      ),
      ddbDocClient2.send(
        new UpdateCommand10({
          ...update,
          Key: { "pk": "USERS", "sk": userid }
        })
      )
    ]);
  } catch (error2) {
    logGetItemError(error2);
    throw new Error("setPublicRivalries: Failed to save public rivalries preference");
  }
  return {
    statusCode: 200,
    body: JSON.stringify({
      message: `Successfully saved public rivalries preference for ${userid}`
    }),
    headers
  };
}
async function savePush(userid, pars) {
  if (pars.payload?.endpoint === void 0) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        message: "savePush: missing payload.endpoint"
      }),
      headers
    };
  }
  try {
    console.log(`Attempting to save push notification credentials for user ${userid}:
${JSON.stringify(pars.payload)}`);
    await savePushSubscription(userid, pars.payload);
    await ddbDocClient2.send(
      new UpdateCommand10({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: { pk: "USER", sk: userid },
        ExpressionAttributeNames: { "#mp": "mayPush" },
        ExpressionAttributeValues: { ":mp": true },
        UpdateExpression: "set #mp = :mp"
      })
    );
  } catch (error2) {
    logGetItemError(error2);
    throw new Error("savePush: Failed to save push notification credentials");
  }
  return {
    statusCode: 200,
    body: JSON.stringify({
      message: `Successfully saved push notifications credentials for ${userid}`
    }),
    headers
  };
}
async function deletePush(userid, pars) {
  const endpoint = pars.endpoint;
  if (endpoint === void 0 || endpoint.length === 0) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        message: "deletePush: missing endpoint"
      }),
      headers
    };
  }
  try {
    await deletePushSubscriptionByEndpoint(userid, endpoint);
    const remaining = await queryPushSubscriptions(userid);
    if (remaining.length === 0) {
      await ddbDocClient2.send(
        new UpdateCommand10({
          TableName: process.env.ABSTRACT_PLAY_TABLE,
          Key: { pk: "USER", sk: userid },
          ExpressionAttributeNames: { "#mp": "mayPush" },
          ExpressionAttributeValues: { ":mp": false },
          UpdateExpression: "set #mp = :mp"
        })
      );
    }
  } catch (error2) {
    logGetItemError(error2);
    throw new Error("deletePush: Failed to delete push subscription");
  }
  return {
    statusCode: 200,
    body: JSON.stringify({
      message: `Successfully deleted push subscription for ${userid}`
    }),
    headers
  };
}
async function saveTags(userid, pars) {
  try {
    console.log(`Attempting to save tags for user ${userid}:
${JSON.stringify(pars.payload)}`);
    if (pars.payload.length === 0) {
      await ddbDocClient2.send(
        new DeleteCommand9({
          TableName: process.env.ABSTRACT_PLAY_TABLE,
          Key: {
            "pk": "TAG",
            "sk": userid
          }
        })
      );
    } else {
      await ddbDocClient2.send(new PutCommand10({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Item: {
          "pk": "TAG",
          "sk": userid,
          "tags": pars.payload
        }
      }));
    }
  } catch (error2) {
    logGetItemError(error2);
    throw new Error("saveTags: Failed to save tags");
  }
  return {
    statusCode: 200,
    body: JSON.stringify({
      message: `Successfully saved tags for ${userid}`
    }),
    headers
  };
}
async function savePalettes(userid, pars) {
  try {
    console.log(`Attempting to save palettes for user ${userid}:
${JSON.stringify(pars.palettes)}`);
    if (pars.palettes.length === 0) {
      await ddbDocClient2.send(
        new DeleteCommand9({
          TableName: process.env.ABSTRACT_PLAY_TABLE,
          Key: {
            "pk": "PALETTES",
            "sk": userid
          }
        })
      );
    } else {
      await ddbDocClient2.send(new PutCommand10({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Item: {
          "pk": "PALETTES",
          "sk": userid,
          "palettes": pars.palettes
        }
      }));
    }
  } catch (error2) {
    logGetItemError(error2);
    throw new Error("saveTags: Failed to save palettes");
  }
  return {
    statusCode: 200,
    body: JSON.stringify({
      message: `Successfully saved palettes for ${userid}`
    }),
    headers
  };
}
async function saveCustomization(userid, pars) {
  try {
    let settings = pars.settings;
    if (typeof settings === "string") {
      settings = JSON.parse(settings);
    }
    await ddbDocClient2.send(new PutCommand10({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Item: {
        "pk": "CUSTOMIZATION#" + userid,
        "sk": pars.metaGame,
        "settings": settings
      }
    }));
  } catch (error2) {
    logGetItemError(error2);
    throw new Error("saveCustomization: Failed to save customization");
  }
  return {
    statusCode: 200,
    body: JSON.stringify({
      message: `Successfully saved customization for ${userid}, ${pars.metaGame}`
    }),
    headers
  };
}
async function deleteCustomization(userid, pars) {
  try {
    console.log(`Deleting customization for user ${userid}, game ${pars.metaGame}`);
    await ddbDocClient2.send(new DeleteCommand9({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: {
        "pk": "CUSTOMIZATION#" + userid,
        "sk": pars.metaGame
      }
    }));
  } catch (error2) {
    logGetItemError(error2);
    throw new Error("deleteCustomization: Failed to delete customization");
  }
  return {
    statusCode: 200,
    body: JSON.stringify({
      message: `Successfully deleted customization for ${userid}, ${pars.metaGame}`
    }),
    headers
  };
}
async function updateStanding(userid, pars) {
  try {
    const Item = {
      pk: "REALSTANDING",
      sk: userid,
      standing: pars.entries
    };
    await ddbDocClient2.send(
      new PutCommand10({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Item
      })
    );
    console.log(`Returning ${JSON.stringify(Item)}`);
    return {
      statusCode: 200,
      body: JSON.stringify(Item),
      headers
    };
  } catch (error2) {
    handleCommonErrors(error2);
    return formatReturnError(`Unable to update standing challenges for ${userid}: ${error2}`);
  }
}
async function notifyRegisteredBotsTurn(metaGame, gameid, game2) {
  let loaded = game2;
  if (!loaded) {
    const item = await loadGameRecord(metaGame, gameid);
    if (!item) {
      return;
    }
    loaded = item;
  }
  const info = gameinfo3.get(metaGame);
  const simultaneous = info.flags !== void 0 && info.flags.includes("simultaneous");
  const toMoveIds = getToMovePlayerIds(loaded, simultaneous);
  for (const id of toMoveIds) {
    if (await isBotId(id)) {
      await enqueueBotOutbound({ type: "move", metaGame, gameid, botId: id });
    }
  }
}
async function botRespondToChallenge(botId, challengeId, metaGame, standing, accepted) {
  return respondedChallenge(botId, {
    response: accepted,
    id: challengeId,
    standing,
    metaGame,
    comment: accepted ? "Let's play!" : ""
  });
}
function validateChallengeVariantUids(metaGame, variants) {
  const info = gameinfo3.get(metaGame);
  if (!info) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: `Unknown metaGame: ${metaGame}` }),
      headers
    };
  }
  const allowed = new Set((info.variants ?? []).map((v) => v.uid));
  const disallowed = (variants ?? []).filter((v) => !allowed.has(v));
  if (disallowed.length > 0) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: `Variant(s) not allowed: ${disallowed.join(", ")}` }),
      headers
    };
  }
  return void 0;
}
async function startSoloGame(userid, pars) {
  const metaGame = pars.metaGame;
  if (metaGame === void 0 || metaGame.length === 0) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: "metaGame is required" }),
      headers
    };
  }
  if (!soloPlaySupported(metaGame)) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: `Game ${metaGame} does not support solo play` }),
      headers
    };
  }
  const variantErr = validateChallengeVariantUids(metaGame, pars.variants);
  if (variantErr) {
    return variantErr;
  }
  let built;
  try {
    built = buildStartSoloGame({
      metaGame,
      variants: pars.variants,
      challengeSeed: pars.challengeSeed,
      noExplore: pars.noExplore,
      ...normalizeSoloClocks(pars)
    });
  } catch (error2) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: `${error2}` }),
      headers
    };
  }
  const info = gameinfo3.get(metaGame);
  const playersFull = await getParticipants([userid]);
  const player = playersFull[0];
  if (player === void 0) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: "Could not load player profile" }),
      headers
    };
  }
  const clocks = normalizeSoloClocks(pars);
  const now = Date.now();
  let whoseTurn = "0";
  if (info.flags !== void 0 && info.flags.includes("simultaneous")) {
    whoseTurn = [true];
  }
  const gamePlayers = [{
    id: player.id,
    name: player.name,
    time: clocks.clockStart * 36e5
  }];
  await ddbDocClient2.send(new PutCommand10({
    TableName: process.env.ABSTRACT_PLAY_TABLE,
    Item: prepareGameStateForStorage({
      pk: "GAME",
      sk: `${metaGame}#0#${built.gameId}`,
      id: built.gameId,
      metaGame,
      numPlayers: 1,
      rated: false,
      players: gamePlayers,
      clockStart: clocks.clockStart,
      clockInc: clocks.clockInc,
      clockMax: clocks.clockMax,
      clockHard: clocks.clockHard,
      noExplore: pars.noExplore || false,
      state: built.state,
      toMove: whoseTurn,
      lastMoveTime: now,
      gameStarted: now,
      variants: built.variants
    })
  }));
  await enqueueGameStartNotifications(
    ddbDocClient2,
    process.env.ABSTRACT_PLAY_TABLE,
    {
      id: built.gameId,
      metaGame,
      variants: built.variants,
      players: gamePlayers.map((p) => ({ id: p.id, name: p.name }))
    },
    inAppSettingsMapFromUsers([{ id: player.id, settings: player.settings }])
  );
  return {
    statusCode: 200,
    body: JSON.stringify({
      gameId: built.gameId,
      metaGame: info.name,
      metaGameUid: metaGame,
      challengeSeed: built.challengeSeed,
      simultaneous: info.flags !== void 0 && info.flags.includes("simultaneous")
    }),
    headers
  };
}
async function newChallenge(userid, challenge) {
  console.log("newChallenge challenge:", challenge);
  const variantErr = validateChallengeVariantUids(challenge.metaGame, challenge.variants);
  if (variantErr) {
    return variantErr;
  }
  if (challenge.standing) {
    return await newStandingChallenge(userid, challenge);
  }
  const challengeId = v4_default();
  const botChallengees = [];
  const addChallenge = ddbDocClient2.send(new PutCommand10({
    TableName: process.env.ABSTRACT_PLAY_TABLE,
    Item: {
      "pk": "CHALLENGE",
      "sk": challengeId,
      "id": challengeId,
      "metaGame": challenge.metaGame,
      "numPlayers": challenge.numPlayers,
      "standing": challenge.standing,
      "duration": challenge.duration,
      "seating": challenge.seating,
      "variants": challenge.variants,
      "challenger": challenge.challenger,
      "challengees": challenge.challengees,
      // users that were challenged
      "players": [challenge.challenger],
      // users that have accepted
      "clockStart": challenge.clockStart,
      "clockInc": challenge.clockInc,
      "clockMax": challenge.clockMax,
      "clockHard": challenge.clockHard,
      "rated": challenge.rated,
      "noExplore": challenge.noExplore || false,
      "comment": challenge.comment || "",
      "dateIssued": Date.now()
    }
  }));
  const updateChallenger = ddbDocClient2.send(new UpdateCommand10({
    TableName: process.env.ABSTRACT_PLAY_TABLE,
    Key: { "pk": "USER", "sk": userid },
    ExpressionAttributeValues: { ":c": /* @__PURE__ */ new Set([challengeId]) },
    ExpressionAttributeNames: { "#ci": "challenges_issued" },
    UpdateExpression: "add #ci :c"
  }));
  const list = [addChallenge, updateChallenger];
  if (challenge.challengees !== void 0) {
    const humanChallengees = [];
    for (const challengee of challenge.challengees) {
      if (await isBotId(challengee.id)) {
        botChallengees.push(challengee);
      } else {
        humanChallengees.push(challengee);
        list.push(
          ddbDocClient2.send(new UpdateCommand10({
            TableName: process.env.ABSTRACT_PLAY_TABLE,
            Key: { "pk": "USER", "sk": challengee.id },
            ExpressionAttributeValues: { ":c": /* @__PURE__ */ new Set([challengeId]) },
            ExpressionAttributeNames: { "#cr": "challenges_received" },
            UpdateExpression: "add #cr :c"
          }))
        );
      }
    }
    try {
      if (humanChallengees.length > 0) {
        list.push(sendChallengedEmail(challenge.challenger.name, humanChallengees, challenge.metaGame, challenge.comment));
        const tableName2 = process.env.ABSTRACT_PLAY_TABLE;
        const challengeNote = optionalNotificationNote(challenge.comment);
        const challengeePlayers = await getPlayers(humanChallengees.map((c) => c.id));
        const challengeeSettings = inAppSettingsMapFromUsers(challengeePlayers);
        for (const challengee of humanChallengees) {
          list.push(createNotification(ddbDocClient2, tableName2, challengee.id, {
            type: "challengeIssued",
            challengeId,
            metaGame: challenge.metaGame,
            challengerId: challenge.challenger.id,
            challengerName: challenge.challenger.name,
            ...challengeNote ? { note: challengeNote } : {}
          }, {
            userSettings: challengeeSettings.get(challengee.id)
          }));
        }
      }
    } catch (error2) {
      logGetItemError(error2);
      throw new Error("newChallenge: Failed to send emails");
    }
  }
  try {
    await Promise.all(list);
    console.log("Successfully added challenge" + challengeId);
    for (const challengee of botChallengees) {
      await enqueueBotOutbound({
        type: "challenge",
        challengeId,
        metaGame: challenge.metaGame,
        botId: challengee.id,
        standing: false
      });
    }
    if (challenge.challengees !== void 0) {
      const idx = challenge.challengees.findIndex((u) => u.id === process.env.AIAI_USERID);
      if (idx !== -1) {
        console.log("Triggering bot management code");
        await botManageChallenges();
      }
    }
    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "Successfully added challenge"
      }),
      headers
    };
  } catch (err) {
    logGetItemError(err);
    return formatReturnError("Failed to add challenge");
  }
}
async function newStandingChallenge(userid, challenge) {
  const challengeId = v4_default();
  const addChallenge = ddbDocClient2.send(new PutCommand10({
    TableName: process.env.ABSTRACT_PLAY_TABLE,
    Item: {
      "pk": "STANDINGCHALLENGE#" + challenge.metaGame,
      "sk": challengeId,
      "id": challengeId,
      "metaGame": challenge.metaGame,
      "numPlayers": challenge.numPlayers,
      "standing": challenge.standing,
      "duration": challenge.duration,
      "seating": challenge.seating,
      "variants": challenge.variants,
      "challenger": challenge.challenger,
      "players": [challenge.challenger],
      // users that have accepted
      "clockStart": challenge.clockStart,
      "clockInc": challenge.clockInc,
      "clockMax": challenge.clockMax,
      "clockHard": challenge.clockHard,
      "rated": challenge.rated,
      "noExplore": challenge.noExplore || false,
      "comment": challenge.comment || "",
      "dateIssued": Date.now()
    }
  }));
  const updateChallenger = ddbDocClient2.send(new UpdateCommand10({
    TableName: process.env.ABSTRACT_PLAY_TABLE,
    Key: { "pk": "USER", "sk": userid },
    ExpressionAttributeValues: { ":c": /* @__PURE__ */ new Set([challenge.metaGame + "#" + challengeId]) },
    ExpressionAttributeNames: { "#cs": "challenges_standing" },
    UpdateExpression: "add #cs :c"
  }));
  const updateStandingChallengeCnt = updateStandingChallengeCount(challenge.metaGame, 1);
  try {
    await Promise.all([addChallenge, updateChallenger, updateStandingChallengeCnt]);
    console.log("Successfully added challenge" + challengeId);
    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "Successfully added challenge"
      }),
      headers
    };
  } catch (err) {
    logGetItemError(err);
    return formatReturnError("Failed to add challenge");
  }
}
async function sendChallengedEmail(challengerName, opponents, metaGame, comment) {
  const humanIds = await filterHumanIds(opponents.map((o) => o.id));
  const players = await getPlayers(humanIds);
  metaGame = gameinfo3.get(metaGame).name;
  await initi18n("en");
  const work = [];
  comment = comment ? comment.trim() : "";
  if (!comment.endsWith(".") && !comment.endsWith("!") && !comment.endsWith("?"))
    comment += ".";
  for (const player of players) {
    await changeLanguageForPlayer(player);
    let body;
    if (comment === ".") {
      body = instance.t("ChallengeBody", { "challenger": challengerName, metaGame });
    } else {
      body = instance.t("ChallengeBodyComment", { "challenger": challengerName, metaGame, comment });
    }
    if (player.email !== void 0 && player.email !== null && player.email !== "") {
      if (player.settings?.all?.notifications === void 0 || player.settings.all.notifications.challenges) {
        const comm = createSendEmailCommand(player.email, player.name, instance.t("ChallengeSubject"), body);
        work.push(sesClient.send(comm));
      } else {
        console.log(`Player ${player.name} (${player.id}) has elected to not receive challenge notifications.`);
      }
    } else {
      console.log(`No verified email address found for ${player.name} (${player.id})`);
    }
    work.push(sendPush({
      userId: player.id,
      topic: "challenges",
      title: instance.t("PUSH.titles.challenged"),
      body,
      url: "/"
    }));
  }
  return Promise.all(work);
}
async function revokeChallenge(userid, pars) {
  let challenge;
  const work = [];
  let work1;
  try {
    ({ challenge, work: work1 } = await removeChallenge(pars.id, pars.metaGame, pars.standing === true, true, userid));
  } catch (err) {
    logGetItemError(err);
    return formatReturnError("Failed to remove challenge");
  }
  if (work1 !== void 0)
    work.push(work1);
  if (challenge) {
    let comment = pars.comment ? pars.comment.trim() : "";
    if (!comment.endsWith(".") && !comment.endsWith("!") && !comment.endsWith("?"))
      comment += ".";
    const metaGame = gameinfo3.get(challenge.metaGame).name;
    await initi18n("en");
    const tableName2 = process.env.ABSTRACT_PLAY_TABLE;
    let revokerName;
    let revokeNote;
    if (!pars.standing) {
      const revokerParts = await getParticipants([userid]);
      revokerName = revokerParts[0]?.name ?? challenge.challenger.name;
      revokeNote = optionalNotificationNote(pars.comment);
    }
    if (challenge.challengees) {
      const players = await getPlayers(await filterHumanIds(challenge.challengees.map((c) => c.id)));
      for (const player of players) {
        await changeLanguageForPlayer(player);
        let body;
        if (comment === ".") {
          body = instance.t("ChallengeRevokedBody", { name: challenge.challenger.name, metaGame });
        } else {
          body = instance.t("ChallengeRevokedBodyComment", { name: challenge.challenger.name, metaGame, comment });
        }
        if (player.email !== void 0 && player.email !== null && player.email !== "") {
          if (player.settings?.all?.notifications === void 0 || player.settings.all.notifications.challenges) {
            const comm = createSendEmailCommand(player.email, player.name, instance.t("ChallengeRevokedSubject"), body);
            work.push(sesClient.send(comm));
          } else {
            console.log(`Player ${player.name} (${player.id}) has elected to not receive challenge notifications.`);
          }
        } else {
          console.log(`No verified email address found for ${player.name} (${player.id})`);
        }
        work.push(sendPush({
          userId: player.id,
          topic: "challenges",
          title: instance.t("PUSH.titles.revoked"),
          body,
          url: "/"
        }));
        if (!pars.standing && revokerName !== void 0) {
          work.push(createNotification(ddbDocClient2, tableName2, player.id, {
            type: "challengeRevoked",
            challengeId: pars.id,
            metaGame: challenge.metaGame,
            revokerId: userid,
            revokerName,
            ...revokeNote ? { note: revokeNote } : {}
          }, {
            userSettings: player.settings
          }));
        }
      }
    }
    if (challenge.players) {
      const players = await getPlayers(await filterHumanIds(challenge.players.map((c) => c.id).filter((id) => id !== challenge.challenger.id)));
      for (const player of players) {
        await changeLanguageForPlayer(player);
        let body;
        if (comment === ".") {
          body = instance.t("ChallengeRevokedBody", { name: challenge.challenger.name, metaGame });
        } else {
          body = instance.t("ChallengeRevokedBodyComment", { name: challenge.challenger.name, metaGame, comment });
        }
        if (player.email !== void 0 && player.email !== null && player.email !== "") {
          if (player.settings?.all?.notifications === void 0 || player.settings.all.notifications.challenges) {
            const comm = createSendEmailCommand(player.email, player.name, instance.t("ChallengeRevokedSubject"), body);
            work.push(sesClient.send(comm));
          } else {
            console.log(`Player ${player.name} (${player.id}) has elected to not receive challenge notifications.`);
          }
        } else {
          console.log(`No verified email address found for ${player.name} (${player.id})`);
        }
        work.push(sendPush({
          userId: player.id,
          topic: "challenges",
          title: instance.t("PUSH.titles.revoked"),
          body,
          url: "/"
        }));
        if (!pars.standing && revokerName !== void 0) {
          work.push(createNotification(ddbDocClient2, tableName2, player.id, {
            type: "challengeRevoked",
            challengeId: pars.id,
            metaGame: challenge.metaGame,
            revokerId: userid,
            revokerName,
            ...revokeNote ? { note: revokeNote } : {}
          }, {
            userSettings: player.settings
          }));
        }
      }
    }
  }
  await Promise.all(work);
  console.log("Successfully removed challenge" + pars.id);
  return {
    statusCode: 200,
    body: JSON.stringify({
      message: "Successfully removed challenge" + pars.id
    }),
    headers
  };
}
async function respondedChallenge(userid, pars) {
  const response = pars.response;
  const challengeId = pars.id;
  const standing = pars.standing === true;
  const metaGame = pars.metaGame;
  console.log(`Responding to challenge standing = ${standing} ${metaGame}.${challengeId} for user ${userid}: ${response ? "accepted" : "rejected"}`);
  let comment = pars.comment ? pars.comment.trim() : "";
  if (!comment.endsWith(".") && !comment.endsWith("!") && !comment.endsWith("?"))
    comment += ".";
  let ret;
  const work = [];
  if (response) {
    let email;
    try {
      email = await acceptChallenge(userid, metaGame, challengeId, standing);
      console.log("Challenge" + challengeId + "successfully accepted.");
      ret = {
        statusCode: 200,
        body: JSON.stringify({
          message: "Challenge " + challengeId + " successfully accepted."
        }),
        headers
      };
    } catch (err) {
      logGetItemError(err);
      return formatReturnError("Failed to accept challenge");
    }
    if (email !== void 0) {
      console.log(email);
      await initi18n("en");
      try {
        for (const [ind, player] of email.players.entries()) {
          await changeLanguageForPlayer(player);
          let body = instance.t("GameStartedBody", { metaGame: email.metaGame });
          if (ind === 0 || email.simultaneous) {
            body += " " + instance.t("YourMove");
          }
          if (comment !== "." && player.id !== userid) {
            body += " " + instance.t("ChallengeResponseComment", { comment });
          }
          if (player.email !== void 0 && player.email !== null && player.email !== "") {
            if (player.settings?.all?.notifications === void 0 || player.settings.all.notifications.gameStart) {
              const ebody = body + " " + instance.t("GameLink", { metaGame, gameId: email.gameId });
              const comm = createSendEmailCommand(player.email, player.name, instance.t("GameStartedSubject"), ebody);
              work.push(sesClient.send(comm));
            } else {
              console.log(`Player ${player.name} (${player.id}) has elected to not receive game start notifications.`);
            }
          } else {
            console.log(`No verified email address found for ${player.name} (${player.id})`);
          }
          work.push(sendPush({
            userId: player.id,
            topic: "started",
            title: instance.t("PUSH.titles.started"),
            body,
            url: "/"
          }));
        }
      } catch (err) {
        logGetItemError(err);
      }
    }
  } else {
    let challenge;
    let work2;
    try {
      ({ challenge, work: work2 } = await removeChallenge(pars.id, pars.metaGame, standing, false, userid));
      await work2;
      console.log("Successfully removed challenge " + pars.id);
      ret = {
        statusCode: 200,
        body: JSON.stringify({
          message: "Successfully removed challenge " + pars.id
        }),
        headers
      };
    } catch (err) {
      logGetItemError(err);
      return formatReturnError("Failed to remove challenge");
    }
    if (challenge !== void 0) {
      await initi18n("en");
      const players = await getPlayers(await filterHumanIds(challenge.challengees.map((c) => c.id).filter((id) => id !== userid).concat(challenge.players.map((c) => c.id))));
      const quitter = challenge.challengees.find((c) => c.id === userid).name;
      const metaGame2 = gameinfo3.get(challenge.metaGame).name;
      const tableName2 = process.env.ABSTRACT_PLAY_TABLE;
      const declineNote = !standing ? optionalNotificationNote(pars.comment) : void 0;
      for (const player of players) {
        await changeLanguageForPlayer(player);
        let body = instance.t("ChallengeRejectedBody", { quitter, metaGame: metaGame2 });
        if (comment !== ".") {
          body += " " + instance.t("ChallengeResponseComment", { comment });
        }
        if (player.email !== void 0 && player.email !== null && player.email !== "") {
          if (player.settings?.all?.notifications === void 0 || player.settings.all.notifications.challenges) {
            const comm = createSendEmailCommand(player.email, player.name, instance.t("ChallengeRejectedSubject"), body);
            work.push(sesClient.send(comm));
          } else {
            console.log(`Player ${player.name} (${player.id}) has elected to not receive challenge notifications.`);
          }
        } else {
          console.log(`No verified email address found for ${player.name} (${player.id})`);
        }
        work.push(sendPush({
          userId: player.id,
          topic: "challenges",
          title: instance.t("PUSH.titles.declined"),
          body,
          url: "/"
        }));
        if (!standing) {
          work.push(createNotification(ddbDocClient2, tableName2, player.id, {
            type: "challengeDeclined",
            challengeId: pars.id,
            metaGame: challenge.metaGame,
            declinerId: userid,
            declinerName: quitter,
            ...declineNote ? { note: declineNote } : {}
          }, {
            userSettings: player.settings
          }));
        }
      }
    }
  }
  await Promise.all(work);
  return ret;
}
async function removeChallenge(challengeId, metaGame, standing, revoked, quitter) {
  const chall = await ddbDocClient2.send(
    new GetCommand12({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: {
        "pk": standing ? "STANDINGCHALLENGE#" + metaGame : "CHALLENGE",
        "sk": challengeId
      }
    })
  );
  if (chall.Item === void 0) {
    console.log("Challenge not found");
    return { "challenge": void 0, "work": void 0 };
  }
  const challenge = chall.Item;
  if (revoked && challenge.challenger.id !== quitter)
    throw new Error(`${quitter} tried to revoke a challenge that they did not create.`);
  if (!revoked && !(challenge.players.find((p) => p.id === quitter) || !standing && challenge.challengees.find((p) => p.id === quitter)))
    throw new Error(`${quitter} tried to leave a challenge that they are not part of.`);
  return { challenge, "work": removeAChallenge(challenge, standing, revoked, false, quitter) };
}
async function removeAChallenge(challenge, standing, revoked, started, quitter) {
  const list = [];
  let expired = false;
  if (standing && !revoked) {
    if ("duration" in challenge && typeof challenge.duration === "number" && challenge.duration > 0) {
      if (challenge.duration === 1) {
        expired = true;
      } else {
        console.log(`decrementing standing challenge ${challenge.metaGame + "#" + challenge.id} duration from ${challenge.duration} to ${challenge.duration - 1}`);
        list.push(
          ddbDocClient2.send(
            new UpdateCommand10({
              TableName: process.env.ABSTRACT_PLAY_TABLE,
              Key: { "pk": "STANDINGCHALLENGE#" + challenge.metaGame, "sk": challenge.id },
              ExpressionAttributeValues: { ":d": challenge.duration - 1 },
              ExpressionAttributeNames: { "#d": "duration" },
              UpdateExpression: "set #d = :d"
            })
          )
        );
      }
    }
  }
  if (!standing) {
    list.push(sendCommandWithRetry(new UpdateCommand10({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: { "pk": "USER", "sk": challenge.challenger.id },
      UpdateExpression: "DELETE challenges_issued :c",
      ExpressionAttributeValues: { ":c": /* @__PURE__ */ new Set([challenge.id]) }
    })));
    for (const challengee of challenge.challengees) {
      if (!await isBotId(challengee.id)) {
        list.push(sendCommandWithRetry(new UpdateCommand10({
          TableName: process.env.ABSTRACT_PLAY_TABLE,
          Key: { "pk": "USER", "sk": challengee.id },
          UpdateExpression: "DELETE challenges_received :c",
          ExpressionAttributeValues: { ":c": /* @__PURE__ */ new Set([challenge.id]) }
        })));
      }
    }
  } else if (revoked || challenge.numPlayers > 2 || expired) {
    console.log(`removing duplicated challenge ${standing ? challenge.metaGame + "#" + challenge.id : challenge.id} from challenger ${challenge.challenger.id}`);
    list.push(sendCommandWithRetry(new UpdateCommand10({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: { "pk": "USER", "sk": challenge.challenger.id },
      UpdateExpression: "DELETE challenges_standing :c",
      ExpressionAttributeValues: { ":c": /* @__PURE__ */ new Set([challenge.metaGame + "#" + challenge.id]) }
    })));
  }
  let playersToUpdate = [];
  if (standing || revoked || started) {
    playersToUpdate = challenge.players.filter((p) => p.id != challenge.challenger.id);
  } else {
    playersToUpdate = [{ "id": quitter }];
  }
  for (const player of playersToUpdate) {
    if (await isBotId(player.id)) {
      continue;
    }
    console.log(`removing challenge ${standing ? challenge.metaGame + "#" + challenge.id : challenge.id} from ${player.id}`);
    list.push(sendCommandWithRetry(new UpdateCommand10({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: { "pk": "USER", "sk": player.id },
      UpdateExpression: "DELETE challenges_accepted :c",
      ExpressionAttributeValues: { ":c": /* @__PURE__ */ new Set([standing ? challenge.metaGame + "#" + challenge.id : challenge.id]) }
    })));
  }
  if (!standing) {
    list.push(
      ddbDocClient2.send(
        new DeleteCommand9({
          TableName: process.env.ABSTRACT_PLAY_TABLE,
          Key: {
            "pk": "CHALLENGE",
            "sk": challenge.id
          }
        })
      )
    );
  } else if (revoked || challenge.numPlayers > 2 || expired) {
    console.log(`removing challenge ${challenge.metaGame + "#" + challenge.id}`);
    list.push(
      ddbDocClient2.send(
        new DeleteCommand9({
          TableName: process.env.ABSTRACT_PLAY_TABLE,
          Key: {
            "pk": "STANDINGCHALLENGE#" + challenge.metaGame,
            "sk": challenge.id
          }
        })
      )
    );
    list.push(updateStandingChallengeCount(challenge.metaGame, -1));
  }
  return Promise.all(list);
}
async function updateStandingChallengeCount(metaGame, diff) {
  await adjustShardedCounts(
    ddbDocClient2,
    process.env.ABSTRACT_PLAY_TABLE,
    metaGame,
    { standingchallenges: diff }
  );
}
async function acceptChallenge(userid, metaGame, challengeId, standing) {
  const challengeData = await ddbDocClient2.send(
    new GetCommand12({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: {
        "pk": standing ? "STANDINGCHALLENGE#" + metaGame : "CHALLENGE",
        "sk": challengeId
      }
    })
  );
  if (challengeData.Item === void 0) {
    console.log("Challenge not found");
    return;
  }
  const challenge = challengeData.Item;
  const challengees = standing || !challenge.challengees ? [] : challenge.challengees.filter((c) => c.id != userid);
  if (!standing && challengees.length !== (challenge.challengees ? challenge.challengees.length : 0) - 1) {
    logGetItemError(`userid ${userid} wasn't a challengee, challenge ${challengeId}`);
    throw new Error("Can't accept a challenge if you weren't challenged");
  }
  const players = challenge.players;
  if ((players ? players.length : 0) === challenge.numPlayers - 1) {
    const gameId = v4_default();
    let playerIDs = [];
    if (challenge.seating === "random") {
      playerIDs = players.map((player) => player.id);
      playerIDs.push(userid);
      shuffle(playerIDs);
    } else if (challenge.seating === "s1") {
      playerIDs.push(challenge.challenger.id);
      playerIDs.push(userid);
    } else if (challenge.seating === "s2") {
      playerIDs.push(userid);
      playerIDs.push(challenge.challenger.id);
    }
    const playersFull = await getParticipants(playerIDs);
    let whoseTurn = "0";
    const info = gameinfo3.get(challenge.metaGame);
    if (info.flags !== void 0 && info.flags.includes("simultaneous")) {
      whoseTurn = playerIDs.map(() => true);
    }
    const variants = challenge.variants;
    console.log(`Variants in the challenge object: ${JSON.stringify(variants)}`);
    let engine;
    if (info.playercounts.length > 1)
      engine = GameFactory7(challenge.metaGame, challenge.numPlayers, variants);
    else
      engine = GameFactory7(challenge.metaGame, void 0, variants);
    if (!engine)
      throw new Error(`Unknown metaGame ${challenge.metaGame}`);
    console.log(`Variants in the game engine: ${JSON.stringify(engine.variants)}`);
    const state = engine.serialize();
    const now = Date.now();
    const gamePlayers = playersFull.map((p) => {
      return { "id": p.id, "name": p.name, "time": challenge.clockStart * 36e5 };
    });
    if (info.flags !== void 0 && info.flags.includes("perspective")) {
      let rot = 180;
      if (playerIDs.length > 2 && info.flags !== void 0 && info.flags.includes("rotate90")) {
        rot = -90;
      }
      for (let i = 1; i < playerIDs.length; i++) {
        gamePlayers[i].settings = { "rotate": i * rot };
      }
    }
    const addGame = ddbDocClient2.send(new PutCommand10({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Item: prepareGameStateForStorage({
        "pk": "GAME",
        "sk": challenge.metaGame + "#0#" + gameId,
        "id": gameId,
        "metaGame": challenge.metaGame,
        "numPlayers": challenge.numPlayers,
        "rated": challenge.rated === true,
        "players": gamePlayers,
        "clockStart": challenge.clockStart,
        "clockInc": challenge.clockInc,
        "clockMax": challenge.clockMax,
        "clockHard": challenge.clockHard,
        "noExplore": challenge.noExplore || false,
        "state": state,
        "toMove": whoseTurn,
        "lastMoveTime": now,
        "gameStarted": now,
        "variants": engine.variants
      })
    }));
    const list = [];
    list.push(addGame);
    list.push(removeAChallenge(challenge, standing, false, true, ""));
    try {
      await Promise.all(list);
      await notifyRegisteredBotsTurn(challenge.metaGame, gameId);
      await enqueueGameStartNotifications(
        ddbDocClient2,
        process.env.ABSTRACT_PLAY_TABLE,
        {
          id: gameId,
          metaGame: challenge.metaGame,
          variants: engine.variants,
          players: gamePlayers.map((p) => ({ id: p.id, name: p.name }))
        },
        inAppSettingsMapFromUsers(playersFull)
      );
      return {
        metaGame: info.name,
        players: playersFull.filter((p) => !p.isBot),
        simultaneous: info.flags !== void 0 && info.flags.includes("simultaneous"),
        gameId
      };
    } catch (error2) {
      logGetItemError(error2);
      throw new Error("Unable to update players and create game");
    }
  } else {
    let newplayer;
    if (standing) {
      const playerFull = await getParticipants([userid]);
      newplayer = { "id": playerFull[0].id, "name": playerFull[0].name };
    } else {
      newplayer = challenge.challengees.find((c) => c.id == userid);
      if (!newplayer)
        throw new Error("Can't accept a challenge if you weren't challenged");
    }
    let updateChallenge;
    if (!standing || challenge.numPlayers == 2 || players && players.length !== 1) {
      challenge.challengees = challengees;
      players.push(newplayer);
      updateChallenge = ddbDocClient2.send(new PutCommand10({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Item: challenge
      }));
    } else {
      ({ challengeId, work: updateChallenge } = await duplicateStandingChallenge(challenge, newplayer));
    }
    const challengeValue = /* @__PURE__ */ new Set([standing ? challenge.metaGame + "#" + challengeId : challengeId]);
    const userUpdates = [updateChallenge];
    if (!await isBotId(userid)) {
      userUpdates.push(sendCommandWithRetry(new UpdateCommand10({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: { "pk": "USER", "sk": userid },
        UpdateExpression: "DELETE challenges_received :c",
        ExpressionAttributeValues: { ":c": challengeValue }
      })));
      userUpdates.push(sendCommandWithRetry(new UpdateCommand10({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: { "pk": "USER", "sk": userid },
        UpdateExpression: "ADD challenges_accepted :c",
        ExpressionAttributeValues: { ":c": challengeValue }
      })));
    }
    await Promise.all(userUpdates);
    return;
  }
}
async function duplicateStandingChallenge(challenge, newplayer) {
  const challengeId = v4_default();
  console.log("Duplicate challenge with newplayer", newplayer);
  const addChallenge = ddbDocClient2.send(new PutCommand10({
    TableName: process.env.ABSTRACT_PLAY_TABLE,
    Item: {
      "pk": "STANDINGCHALLENGE#" + challenge.metaGame,
      "sk": challengeId,
      "id": challengeId,
      "metaGame": challenge.metaGame,
      "numPlayers": challenge.numPlayers,
      "standing": challenge.standing,
      "seating": challenge.seating,
      "variants": challenge.variants,
      "challenger": challenge.challenger,
      "players": [challenge.challenger, newplayer],
      // users that have accepted
      "challengees": [challenge.challenger, newplayer],
      // users that have accepted
      "clockStart": challenge.clockStart,
      "clockInc": challenge.clockInc,
      "clockMax": challenge.clockMax,
      "clockHard": challenge.clockHard,
      "noExplore": challenge.noExplore || false,
      "rated": challenge.rated,
      "dateIssued": challenge.dateIssued
    }
  }));
  const updateStandingChallengeCnt = updateStandingChallengeCount(challenge.metaGame, 1);
  const updateChallenger = ddbDocClient2.send(new UpdateCommand10({
    TableName: process.env.ABSTRACT_PLAY_TABLE,
    Key: { "pk": "USER", "sk": challenge.challenger.id },
    ExpressionAttributeValues: { ":c": /* @__PURE__ */ new Set([challenge.metaGame + "#" + challengeId]) },
    ExpressionAttributeNames: { "#cs": "challenges_standing" },
    UpdateExpression: "add #cs :c"
  }));
  return { challengeId, "work": Promise.all([addChallenge, updateStandingChallengeCnt, updateChallenger]) };
}
async function getPlayers(playerIDs) {
  const players = [];
  for (const id of playerIDs) {
    if (await isBotId(id)) {
      const bot = await getBotRecord(id);
      if (bot) {
        players.push(botToFullUserStub(bot));
      }
      continue;
    }
    const playerData = await sendCommandWithRetry(
      new GetCommand12({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "USER",
          "sk": id
        }
      })
    );
    if (playerData.Item) {
      players.push(playerData.Item);
    }
  }
  return players;
}
async function inAppSettingsMapForUserIds(userIds) {
  const players = await getPlayers(await filterHumanIds(userIds));
  return inAppSettingsMapFromUsers(players);
}
async function submitMove(userid, pars) {
  if (pars.cbit !== 0) {
    return formatReturnError("cbit must be 0");
  }
  const gamePromise = sendCommandWithRetry(
    new GetCommand12({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: {
        "pk": "GAME",
        "sk": pars.metaGame + "#0#" + pars.id
      }
    })
  );
  let opponentExplorationPromise = null;
  if (pars.opponentId && pars.moveNumber !== void 0) {
    opponentExplorationPromise = sendCommandWithRetry(
      new GetCommand12({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "GAMEEXPLORATION#" + pars.id,
          "sk": pars.opponentId + "#" + pars.moveNumber
        }
      })
    );
  }
  let data;
  let opponentExplorationData = null;
  try {
    if (opponentExplorationPromise) {
      [data, opponentExplorationData] = await Promise.all([gamePromise, opponentExplorationPromise]);
    } else {
      data = await gamePromise;
    }
  } catch (error2) {
    logGetItemError(error2);
    return formatReturnError(`Unable to get game ${pars.id} from table ${process.env.ABSTRACT_PLAY_TABLE}`);
  }
  if (!data.Item)
    throw new Error(`No game ${pars.id} in table ${process.env.ABSTRACT_PLAY_TABLE}`);
  try {
    const game2 = hydrateGameState(data.Item);
    console.log("got game in submitMove:");
    console.log(game2);
    const engine = GameFactory7(game2.metaGame, game2.state);
    if (!engine)
      throw new Error(`Unknown metaGame ${game2.metaGame}`);
    const currentMoveNumber = engine.stack.length;
    if (pars.moveNumber !== void 0 && pars.moveNumber !== currentMoveNumber) {
      return formatReturnError(`Move number mismatch: browser has ${pars.moveNumber} moves but game has ${currentMoveNumber} moves. Please refresh your browser.`);
    }
    let opponentExploration = null;
    if (opponentExplorationData?.Item?.tree) {
      try {
        opponentExploration = JSON.parse(opponentExplorationData.Item.tree);
      } catch (error2) {
        console.log(`Error parsing opponent exploration tree: ${error2}`);
      }
    }
    const flags = gameinfo3.get(game2.metaGame).flags;
    const simultaneous = flags !== void 0 && flags.includes("simultaneous");
    const lastMoveTime = new Date(engine.stack[engine.stack.length - 1]._timestamp).getTime();
    let autoMoves = 0;
    let autoMovesPerPlayer = [];
    const list = [];
    try {
      if (pars.move === "resign") {
        resign(userid, engine, game2);
      } else if (pars.move === "timeout") {
        timeout(userid, engine, game2);
      } else if (pars.move === "" && pars.draw === "drawaccepted") {
        drawaccepted(userid, engine, game2, simultaneous);
      } else if (simultaneous) {
        applySimultaneousMove(userid, pars.move, engine, game2);
      } else {
        const result = applyMove(userid, pars.move, currentMoveNumber, engine, game2, flags, opponentExploration, pars.exploration);
        autoMoves = result.autoMoves;
        autoMovesPerPlayer = result.autoMovesPerPlayer;
        for (const workItem of result.work) {
          list.push(workItem);
        }
      }
    } catch (error2) {
      logGetItemError(error2);
      return formatReturnError(`Unable to apply move ${pars.move}`, error2);
    }
    const player = game2.players.find((p) => p.id === userid);
    if (!player)
      throw new Error(`Player ${userid} isn't playing in game ${pars.id}`);
    if (pars.draw === "drawoffer" && autoMoves === 0) {
      player.draw = "offered";
    } else {
      game2.players.forEach((p) => delete p.draw);
    }
    const timestamp = new Date(engine.stack[engine.stack.length - 1]._timestamp).getTime();
    const timeUsed = timestamp - lastMoveTime;
    if (player.time - timeUsed < 0)
      player.time = game2.clockInc * 36e5;
    else
      player.time = player.time - timeUsed + game2.clockInc * 36e5;
    if (player.time > game2.clockMax * 36e5)
      player.time = game2.clockMax * 36e5;
    for (let i = 0; i < autoMovesPerPlayer.length; i++) {
      if (autoMovesPerPlayer[i] > 0) {
        game2.players[i].time = (game2.players[i].time || 0) + autoMovesPerPlayer[i] * game2.clockInc * 36e5;
        if (game2.players[i].time > game2.clockMax * 36e5)
          game2.players[i].time = game2.clockMax * 36e5;
      }
    }
    const playerIDs = game2.players.map((p) => p.id);
    const players = await getParticipants(playerIDs);
    const playerGame = {
      "id": game2.id,
      "metaGame": game2.metaGame,
      "players": game2.players,
      "clockHard": game2.clockHard,
      "noExplore": game2.noExplore || false,
      "lastMoveTime": timestamp,
      "numMoves": engine.stack.length - 1,
      "gameStarted": new Date(engine.stack[0]._timestamp).getTime(),
      "variants": engine.variants
    };
    if (engine.gameover) {
      playerGame.gameEnded = new Date(engine.stack[engine.stack.length - 1]._timestamp).getTime();
      playerGame.winner = engine.winner;
    }
    if (game2.toMove === "" || game2.toMove === null) {
      list.push(sendCommandWithRetry(
        new DeleteCommand9({
          TableName: process.env.ABSTRACT_PLAY_TABLE,
          Key: {
            "pk": "GAME",
            "sk": game2.sk
          }
        })
      ));
      console.log("Scheduled delete and updates to game lists");
      game2.sk = game2.metaGame + "#1#" + game2.id;
      if (game2.tournament !== void 0) {
        list.push(tournamentUpdates(game2, players, pars.move === "timeout" ? parseInt(game2.toMove) : void 0));
      }
      if (game2.event !== void 0) {
        const winners = engine.winner.map((n) => players[n - 1]).map((p) => p.id);
        list.push(eventUpdates({ eventid: game2.event, gameid: pars.id, winner: winners }));
      }
      list.push(enqueueGameEndNotifications(
        ddbDocClient2,
        process.env.ABSTRACT_PLAY_TABLE,
        toNotificationGame({ ...game2, winner: engine.winner, variants: engine.variants }),
        inAppSettingsMapFromUsers(players)
      ));
    }
    setGameEndedFromEngine(game2, engine);
    game2.numMoves = engine.stack.length - 1;
    game2.lastMoveTime = timestamp;
    const updateGame = sendCommandWithRetry(new PutCommand10({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Item: prepareGameStateForStorage(game2)
    }));
    list.push(updateGame);
    console.log("Scheduled update to game");
    for (let ind = 0; ind < players.length; ind++) {
      const player2 = players[ind];
      if (player2.isBot) {
        continue;
      }
      if (player2.id === userid && (game2.toMove === "" || game2.toMove === null)) {
        const seen = Date.now();
        list.push(upsertUserGameOverlay(
          ddbDocClient2,
          process.env.ABSTRACT_PLAY_TABLE,
          player2.id,
          playerGame.id,
          { seen }
        ));
      }
    }
    list.push(updateWatcherSummaries(
      ddbDocClient2,
      process.env.ABSTRACT_PLAY_TABLE,
      game2.id,
      playerGame
    ));
    if (simultaneous)
      game2.partialMove = game2.players.map((p, i) => p.id === userid ? game2.partialMove.split(",")[i] : "").join(",");
    list.push(sendSubmittedMoveEmails(game2, players.filter((p) => !p.isBot), simultaneous));
    console.log("Scheduled emails");
    await realPingBot(game2.metaGame, game2.id, game2);
    await Promise.all(list);
    await wsBroadcast("game", { "meta": pars.metaGame, "id": pars.id }, [userid]);
    if (game2.gameEnded === void 0) {
      const engine2 = GameFactory7(game2.metaGame, game2.state);
      if (engine2 === void 0) {
        throw new Error(`Could not rehydrate the state for id "${pars.id}", meta "${pars.metaGame}".`);
      }
      if (!engine2.gameover) {
        let player2;
        const pidx = game2.players.findIndex((p) => p.id === userid);
        if (pidx >= 0) {
          player2 = pidx + 1;
        }
        game2.state = engine2.serialize({ strip: true, player: player2 });
      }
    }
    console.log("All updates complete");
    return {
      statusCode: 200,
      body: JSON.stringify(game2),
      headers
    };
  } catch (error2) {
    logGetItemError(error2);
    return formatReturnError("Unable to process submit move");
  }
}
async function tournamentUpdates(game2, players, timeout2) {
  let work = [];
  for (let i = 0; i < 2; i++) {
    const player = players[i];
    let score = 0;
    if (game2.winner?.length === 1 && game2.players[game2.winner[0] - 1].id === player.id) {
      score = 1;
    } else if (game2.winner?.length === 2) {
      score = 0.5;
    }
    console.log(`player ${player.name} now has score ${score} in game ${game2.id} from tournament ${game2.tournament}`);
    work.push(sendCommandWithRetry(new UpdateCommand10({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: { "pk": "TOURNAMENTPLAYER", "sk": game2.tournament + "#" + game2.division.toString() + "#" + player.id },
      ExpressionAttributeNames: { "#s": "score", "#t": "timeout" },
      ExpressionAttributeValues: { ":inc": score, ":t": i === timeout2 },
      UpdateExpression: "add #s :inc set #t = :t"
    })));
  }
  const winner = game2.winner?.map((w) => game2.players[w - 1].id);
  work.push(sendCommandWithRetry(new UpdateCommand10({
    TableName: process.env.ABSTRACT_PLAY_TABLE,
    Key: { "pk": "TOURNAMENTGAME", "sk": game2.tournament + "#" + game2.division.toString() + "#" + game2.id },
    ExpressionAttributeNames: { "#w": "winner" },
    ExpressionAttributeValues: { ":w": winner },
    UpdateExpression: "set #w = :w"
  })));
  const tournamentData = await sendCommandWithRetry(new UpdateCommand10({
    TableName: process.env.ABSTRACT_PLAY_TABLE,
    Key: { "pk": "TOURNAMENT", "sk": game2.tournament },
    ExpressionAttributeNames: { "#d": "divisions", "#n": game2.division.toString() },
    ExpressionAttributeValues: { ":inc": 1, ":zero": 0 },
    UpdateExpression: "set #d.#n.numCompleted = if_not_exists(#d.#n.numCompleted, :zero) + :inc",
    ReturnValues: "ALL_NEW"
  }));
  const tournament = tournamentData.Attributes;
  let divisionCompleted = false;
  for (const division of Object.values(tournament.divisions)) {
    if (division.numCompleted === division.numGames && !division.processed) {
      divisionCompleted = true;
      break;
    }
  }
  if (divisionCompleted) {
    console.log("division completed, processing tournament");
    await Promise.all(work);
    work = [];
    work.push(endTournament(tournament));
  }
  return Promise.all(work);
}
async function sendSubmittedMoveEmails(game2, players0, simultaneous) {
  await initi18n("en");
  const work = [];
  if (game2.toMove !== "") {
    let playerIds = [];
    if (!simultaneous) {
      playerIds.push(game2.players[parseInt(game2.toMove)].id);
    } else if (game2.toMove.every((b) => b === true)) {
      playerIds = game2.players.map((p) => p.id);
    }
    const players = players0.filter((p) => playerIds.includes(p.id));
    const metaGame = gameinfo3.get(game2.metaGame).name;
    if (game2.numPlayers !== 1) {
      for (const player of players) {
        await changeLanguageForPlayer(player);
        work.push(sendPush({
          userId: player.id,
          topic: "yourturn",
          title: instance.t("PUSH.titles.yourturn"),
          body: instance.t("YourMoveBody", { metaGame }),
          url: `/move/${game2.metaGame}/0/${game2.id}`
        }));
      }
    }
  } else {
    const playerIds = game2.players.map((p) => p.id);
    const players = players0.filter((p) => playerIds.includes(p.id));
    const metaGame = gameinfo3.get(game2.metaGame).name;
    const engine = GameFactory7(game2.metaGame, game2.state);
    if (!engine)
      throw new Error(`Unknown metaGame ${game2.metaGame}`);
    const scores = [];
    if (gameinfo3.get(game2.metaGame).flags.includes("scores")) {
      for (let p = 1; p <= engine.numplayers; p++) {
        scores.push(engine.getPlayerScore(p));
      }
    }
    for (const player of players) {
      await changeLanguageForPlayer(player);
      const body = [];
      body.push(instance.t("GameOverBody", { metaGame }));
      let result = "lose";
      if (engine.winner.length > 1) {
        result = "draw";
      } else if (engine.winner.length === 1) {
        const winner = playerIds[engine.winner[0] - 1];
        if (winner === player.id) {
          result = "win";
        }
      }
      body.push(instance.t("GameOverResult", { context: result }));
      if (scores.length > 0) {
        body.push(instance.t("GameOverScores", { scores: scores.join(", ") }));
      }
      body.push(instance.t("GameOverLink", { metaGame: game2.metaGame, gameID: game2.id }));
      if (player.email !== void 0 && player.email !== null && player.email !== "") {
        if (player.settings?.all?.notifications === void 0 || player.settings.all.notifications.gameEnd) {
          const comm = createSendEmailCommand(player.email, player.name, instance.t("GameOverSubject"), body.join(" "));
          work.push(sesClient.send(comm));
        } else {
          console.log(`Player ${player.name} (${player.id}) has elected to not receive game end notifications.`);
        }
      } else {
        console.log(`No verified email address found for ${player.name} (${player.id})`);
      }
      work.push(sendPush({
        userId: player.id,
        topic: "ended",
        title: instance.t("PUSH.titles.ended"),
        body: body.join(" "),
        url: `/move/${game2.metaGame}/1/${game2.id}`
      }));
    }
  }
  return Promise.all(work);
}
function resign(userid, engine, game2) {
  const player = game2.players.findIndex((p) => p.id === userid);
  if (player === void 0)
    throw new Error(`${userid} isn't playing in this game!`);
  engine.resign(player + 1);
  game2.state = engine.serialize();
  game2.state = engine.serialize();
  if (engine.gameover) {
    game2.toMove = "";
    game2.winner = engine.winner;
    game2.numMoves = engine.state().stack.length - 1;
  } else {
    const flags = gameinfo3.get(game2.metaGame).flags;
    const simultaneous = flags !== void 0 && flags.includes("simultaneous");
    if (simultaneous) {
      applySimultaneousMove(userid, "resign", engine, game2);
    } else {
      applyMove(userid, "resign", -1, engine, game2, flags);
    }
  }
}
function timeout(userid, engine, game2) {
  if (game2.toMove === "")
    throw new Error("Can't timeout a game that has already ended");
  let loser;
  if (Array.isArray(game2.toMove)) {
    let minTime = 0;
    let minIndex = -1;
    const elapsed = Date.now() - game2.lastMoveTime;
    game2.toMove.forEach((p, i) => {
      if (p && game2.players[i].time - elapsed < minTime) {
        minTime = game2.players[i].time - elapsed;
        minIndex = i;
      }
    });
    if (minIndex !== -1) {
      loser = minIndex;
    } else {
      throw new Error("Nobody's time is up!");
    }
  } else {
    if (game2.players[parseInt(game2.toMove)].time - (Date.now() - game2.lastMoveTime) < 0) {
      loser = parseInt(game2.toMove);
    } else {
      throw new Error("Opponent's time isn't up!");
    }
  }
  engine.timeout(loser + 1);
  game2.state = engine.serialize();
  if (engine.gameover) {
    game2.toMove = "";
    game2.winner = engine.winner;
    game2.numMoves = engine.state().stack.length - 1;
  } else {
    const loserid = game2.players[loser].id;
    const flags = gameinfo3.get(game2.metaGame).flags;
    const simultaneous = flags !== void 0 && flags.includes("simultaneous");
    if (simultaneous) {
      applySimultaneousMove(loserid, "timeout", engine, game2);
    } else {
      applyMove(loserid, "timeout", -1, engine, game2, flags);
    }
  }
}
function drawaccepted(userid, engine, game2, simultaneous) {
  if (!simultaneous && game2.players[parseInt(game2.toMove)].id !== userid || simultaneous && !game2.players.some((p, i) => game2.toMove[i] && p.id === userid)) {
    throw new Error("It is not your turn!");
  }
  const player = game2.players.find((p) => p.id === userid);
  if (!player)
    throw new Error("You can't accept a draw in a game you aren't playig in!");
  player.draw = "accepted";
  if (game2.players.every((p) => p.draw === "offered" || p.draw === "accepted")) {
    engine.draw();
    game2.state = engine.serialize();
    game2.toMove = "";
    game2.winner = engine.winner;
    game2.numMoves = engine.state().stack.length - 1;
  }
}
async function timeloss(check, player, gameid, metaGame, timestamp) {
  let data;
  try {
    data = await ddbDocClient2.send(
      new GetCommand12({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "GAME",
          "sk": metaGame + "#0#" + gameid
        }
      })
    );
  } catch (error2) {
    logGetItemError(error2);
    throw new Error(`Unable to get game ${metaGame}, ${gameid} from table ${process.env.ABSTRACT_PLAY_TABLE}`);
  }
  if (!data.Item)
    throw new Error(`No game ${metaGame}, ${gameid} found in table ${process.env.ABSTRACT_PLAY_TABLE}`);
  const game2 = hydrateGameState(data.Item);
  if (check) {
    console.log("game.toMove", game2.toMove);
    if (Array.isArray(game2.toMove)) {
      let minTime = 0;
      let minIndex = -1;
      const elapsed = Date.now() - game2.lastMoveTime;
      game2.toMove.forEach((p, i) => {
        if (p && game2.players[i].time - elapsed < minTime) {
          minTime = game2.players[i].time - elapsed;
          minIndex = i;
        }
      });
      if (minIndex !== -1) {
        player = minIndex;
      } else {
        throw "Nobody's time is up!";
      }
    } else {
      if (game2.toMove === "")
        throw "Game is already over!";
      const toMove = parseInt(game2.toMove);
      if (game2.players[toMove].time - (Date.now() - game2.lastMoveTime) < 0) {
        player = toMove;
      } else {
        throw "Opponent's time isn't up!";
      }
    }
  }
  const engine = GameFactory7(game2.metaGame, game2.state);
  if (!engine)
    throw new Error(`Unknown metaGame ${game2.metaGame}`);
  engine.timeout(player + 1);
  game2.state = engine.serialize();
  game2.toMove = "";
  game2.winner = engine.winner;
  game2.numMoves = engine.state().stack.length - 1;
  game2.lastMoveTime = timestamp;
  setGameEndedFromEngine(game2, engine);
  const playerIDs = game2.players.map((p) => p.id);
  const players = await getPlayers(playerIDs);
  const playerGame = {
    "id": game2.id,
    "metaGame": game2.metaGame,
    "players": game2.players,
    "clockHard": game2.clockHard,
    "noExplore": game2.noExplore || false,
    "winner": game2.winner,
    "toMove": game2.toMove,
    "lastMoveTime": game2.lastMoveTime,
    "gameStarted": new Date(engine.stack[0]._timestamp).getTime(),
    "gameEnded": new Date(engine.stack[engine.stack.length - 1]._timestamp).getTime(),
    "numMoves": engine.stack.length - 1,
    "variants": engine.variants
  };
  const work = [];
  work.push(ddbDocClient2.send(
    new DeleteCommand9({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: {
        "pk": "GAME",
        "sk": game2.sk
      }
    })
  ));
  console.log("Scheduled delete and updates to game lists");
  game2.sk = game2.metaGame + "#1#" + game2.id;
  work.push(ddbDocClient2.send(new PutCommand10({
    TableName: process.env.ABSTRACT_PLAY_TABLE,
    Item: prepareGameStateForStorage(game2)
  })));
  work.push(updateWatcherSummaries(
    ddbDocClient2,
    process.env.ABSTRACT_PLAY_TABLE,
    game2.id,
    playerGame
  ));
  if (game2.tournament !== void 0) {
    work.push(tournamentUpdates(game2, players, player));
  }
  work.push(enqueueGameEndNotifications(
    ddbDocClient2,
    process.env.ABSTRACT_PLAY_TABLE,
    toNotificationGame(game2),
    inAppSettingsMapFromUsers(players)
  ));
  await Promise.all(work);
  return game2;
}
async function checkForAbandonedGame(userid, pars) {
  let data;
  try {
    data = await ddbDocClient2.send(
      new GetCommand12({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "GAME",
          "sk": pars.metaGame + "#0#" + pars.id
        }
      })
    );
  } catch (error2) {
    logGetItemError(error2);
    throw new Error(`Unable to get game ${pars.metaGame}, ${pars.id} from table ${process.env.ABSTRACT_PLAY_TABLE}`);
  }
  if (!data.Item)
    throw new Error(`No game ${pars.metaGame}, ${pars.id} found in table ${process.env.ABSTRACT_PLAY_TABLE}`);
  try {
    const game2 = hydrateGameState(data.Item);
    const playerIDs = game2.players.map((p) => p.id);
    const humanIds = await filterHumanIds(playerIDs);
    const lastSeenByUser = await getUsersLastSeen(
      ddbDocClient2,
      process.env.ABSTRACT_PLAY_TABLE,
      humanIds
    );
    const now = Date.now();
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1e3;
    if (game2.toMove == "" || game2.clockHard || [...lastSeenByUser.values()].some((lastSeen) => lastSeen !== void 0 && lastSeen > now - thirtyDaysMs) || game2.lastMoveTime > now - thirtyDaysMs) {
      return {
        statusCode: 200,
        body: "not_abandoned",
        headers
      };
    }
    const engine = GameFactory7(game2.metaGame, game2.state);
    if (!engine)
      throw new Error(`Unknown metaGame ${game2.metaGame}`);
    engine.abandoned();
    game2.state = engine.serialize();
    game2.toMove = "";
    game2.winner = engine.winner;
    game2.numMoves = engine.state().stack.length - 1;
    game2.lastMoveTime = now;
    setGameEndedFromEngine(game2, engine);
    const playerGame = {
      "id": game2.id,
      "metaGame": game2.metaGame,
      "players": game2.players,
      "clockHard": game2.clockHard,
      "noExplore": game2.noExplore || false,
      "winner": game2.winner,
      "toMove": game2.toMove,
      "lastMoveTime": game2.lastMoveTime,
      "gameStarted": new Date(engine.stack[0]._timestamp).getTime(),
      "gameEnded": new Date(engine.stack[engine.stack.length - 1]._timestamp).getTime(),
      "numMoves": engine.stack.length - 1,
      "variants": engine.variants
    };
    const work = [];
    work.push(ddbDocClient2.send(
      new DeleteCommand9({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "GAME",
          "sk": game2.sk
        }
      })
    ));
    console.log("Scheduled delete and updates to game lists");
    game2.sk = game2.metaGame + "#1#" + game2.id;
    work.push(ddbDocClient2.send(new PutCommand10({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Item: prepareGameStateForStorage(game2)
    })));
    work.push(updateWatcherSummaries(
      ddbDocClient2,
      process.env.ABSTRACT_PLAY_TABLE,
      game2.id,
      playerGame
    ));
    const abandonedGameEndSettings = await inAppSettingsMapForUserIds(
      game2.players.map((p) => p.id)
    );
    work.push(enqueueGameEndNotifications(
      ddbDocClient2,
      process.env.ABSTRACT_PLAY_TABLE,
      toNotificationGame(game2),
      abandonedGameEndSettings
    ));
    await Promise.all(work);
    return {
      statusCode: 200,
      body: JSON.stringify(game2),
      headers
    };
  } catch (error2) {
    logGetItemError(error2);
    return formatReturnError("Error in checking for abandoned game");
  }
}
async function checkForTimeloss(userid, pars) {
  try {
    const game2 = await timeloss(true, -1, pars.id, pars.metaGame, Date.now());
    return {
      statusCode: 200,
      body: JSON.stringify(game2),
      headers
    };
  } catch (error2) {
    if (error2 === "Nobody's time is up!" || error2 === "Opponent's time isn't up!" || "Game is already over!") {
      return {
        statusCode: 200,
        body: "not_a_timeloss",
        headers
      };
    }
    logGetItemError(error2);
    return formatReturnError("Unable to process check for timeloss");
  }
}
function applySimultaneousMove(userid, move, engine, game2) {
  const partialMove = game2.partialMove;
  const moves = partialMove === void 0 ? game2.players.map(() => "") : partialMove.split(",");
  let cnt = 0;
  let found = false;
  for (let i = 0; i < game2.numPlayers; i++) {
    if (game2.players[i].id === userid) {
      found = true;
      if (moves[i] !== "" || !game2.toMove[i]) {
        throw new Error("You have already submitted your move for this turn!");
      }
      moves[i] = move;
      game2.toMove[i] = false;
    }
    if (engine.isEliminated(i + 1)) {
      moves[i] = "\x91";
    }
    if (moves[i] !== "")
      cnt++;
  }
  if (!found) {
    throw new Error("You are not participating in this game!");
  }
  if (cnt < game2.numPlayers) {
    game2.partialMove = moves.join(",");
    console.log(game2.partialMove);
    engine.move(game2.partialMove, { partial: true });
  } else {
    engine.move(moves.join(","));
    game2.state = engine.serialize();
    game2.partialMove = game2.players.map(() => "").join(",");
    if (engine.gameover) {
      game2.toMove = "";
      game2.winner = engine.winner;
      game2.numMoves = engine.state().stack.length - 1;
    } else {
      game2.toMove = game2.players.map((p, i) => !engine.isEliminated(i + 1));
    }
  }
}
function findExplorationChild(exploration, move, engine) {
  if (!exploration)
    return null;
  for (const child of exploration) {
    try {
      if (engine.sameMove(move, child.move)) {
        return child;
      }
    } catch {
    }
  }
  return null;
}
function findPremoveChild(exploration) {
  if (!exploration)
    return null;
  return exploration.find((child) => child.premove === true) || null;
}
function findForcedMove(engine, flags) {
  let forcedMove = null;
  if (flags !== void 0 && flags.includes("automove") && !engine.gameover) {
    if (engine.moves().length === 1 && !(flags.includes("pie-even") && engine.state().stack.length === 2)) {
      forcedMove = engine.moves()[0];
      console.log(`Found forced move: ${forcedMove}`);
    }
  } else if (flags !== void 0 && flags.includes("autopass") && !engine.gameover) {
    if (engine.moves().length === 1 && engine.moves()[0] === "pass" && !(flags.includes("pie-even") && engine.state().stack.length === 2)) {
      console.log(`Applying forced pass`);
      forcedMove = engine.moves()[0];
      console.log(`Found forced move: ${forcedMove}`);
    }
  }
  return forcedMove;
}
function applyMove(userid, move, moveNumber, engine, game2, flags, opponentExploration = null, myExploration = null) {
  if (game2.players[parseInt(game2.toMove)].id !== userid) {
    throw new Error("It is not your turn!");
  }
  const myPlayerIndex = parseInt(game2.toMove);
  const opponentPlayerIndex = 1 - myPlayerIndex;
  const explorations = [null, null];
  explorations[myPlayerIndex] = myExploration;
  explorations[opponentPlayerIndex] = opponentExploration;
  console.log(`My explorations: ${JSON.stringify(explorations[myPlayerIndex])}, Opponent explorations: ${JSON.stringify(explorations[opponentPlayerIndex])}`);
  let autoMoves = 0;
  const autoMovesPerPlayer = new Array(game2.players.length).fill(0);
  console.log(`Applying submitted move: ${move}`);
  engine.move(move);
  while (!engine.gameover && move) {
    explorations[0] = findExplorationChild(explorations[0], move, engine)?.children || null;
    explorations[1] = findExplorationChild(explorations[1], move, engine)?.children || null;
    move = findForcedMove(engine, flags);
    if (!move) {
      const currentPlayerIndex = engine.currplayer - 1;
      const currentExploration = explorations[currentPlayerIndex];
      const premoveNode = findPremoveChild(currentExploration);
      if (premoveNode) {
        move = premoveNode.move;
        console.log(`Applying premove for player ${currentPlayerIndex}: ${move}`);
      }
    }
    if (move) {
      const movedPlayerIndex = engine.currplayer - 1;
      try {
        engine.move(move);
        autoMoves += 1;
        autoMovesPerPlayer[movedPlayerIndex] += 1;
      } catch (e) {
        console.log(`Premove ${move} is invalid!: ${e}`);
        break;
      }
    }
  }
  const work = [];
  if (!engine.gameover) {
    if (explorations[0] && explorations[0].length > 0) {
      work.push(sendCommandWithRetry(new PutCommand10({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Item: {
          "pk": "GAMEEXPLORATION#" + game2.id,
          "sk": game2.players[0].id + "#" + (moveNumber + 1 + autoMoves),
          "user": game2.players[0].id,
          "game": game2.id,
          "move": moveNumber + 1 + autoMoves,
          "tree": JSON.stringify(explorations[0])
        }
      })));
    }
    if (explorations[1] && explorations[1].length > 0) {
      work.push(sendCommandWithRetry(new PutCommand10({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Item: {
          "pk": "GAMEEXPLORATION#" + game2.id,
          "sk": game2.players[1].id + "#" + (moveNumber + 1 + autoMoves),
          "user": game2.players[1].id,
          "game": game2.id,
          "move": moveNumber + 1 + autoMoves,
          "tree": JSON.stringify(explorations[1])
        }
      })));
    }
  }
  game2.state = engine.serialize();
  game2.numMoves = engine.state().stack.length - 1;
  if (engine.gameover) {
    game2.toMove = "";
    game2.winner = engine.winner;
  } else {
    if (!("currplayer" in engine) || engine.currplayer === void 0 || engine.currplayer === null || typeof engine.currplayer !== "number") {
      throw new Error("The engine must provide a current player for `applyMove()` to be able to function.");
    }
    game2.toMove = `${engine.currplayer - 1}`;
  }
  return { autoMoves, autoMovesPerPlayer, work };
}
function isInterestingComment(comment) {
  if (!comment || comment.trim().length === 0) {
    return false;
  }
  const normalized = comment.toLowerCase().trim();
  const withoutPunctuation = normalized.replace(/[^\w\s]/g, "");
  const boringPhrases = /* @__PURE__ */ new Set([
    "gg",
    "glhf",
    "gl",
    "hf",
    "tagg",
    "hi",
    "hello",
    "hey",
    "thanks",
    "thx",
    "ty",
    "yw",
    "np",
    "wp",
    "well played",
    "good game",
    "good luck",
    "have fun",
    "thanks for the game",
    "pie invoked",
    "move",
    "gg sir",
    "gg!",
    "tagg!",
    "glhf!",
    "to a good game",
    "have a good game",
    "good luck!",
    "have fun!",
    "thanks for playing",
    "thanks for the game!",
    "gg thanks",
    "yoyo",
    "yoyo gl",
    "yoyo gl hf"
  ]);
  if (boringPhrases.has(normalized) || boringPhrases.has(withoutPunctuation)) {
    return false;
  }
  const words = withoutPunctuation.split(/\s+/).filter((w) => w.length > 0);
  const commonWords = /* @__PURE__ */ new Set([
    "gg",
    "gl",
    "hf",
    "tagg",
    "hi",
    "hello",
    "yoyo",
    "thanks",
    "thx",
    "ty",
    "wp",
    "move",
    "pie",
    "invoked",
    "good",
    "game",
    "luck",
    "fun",
    "for",
    "the",
    "a",
    "to",
    "have",
    "sir",
    "well",
    "played",
    "you",
    "too"
  ]);
  if (words.length <= 3 && words.every((w) => commonWords.has(w))) {
    return false;
  }
  return true;
}
async function updateLastChatForPlayers(gameId, metaGame, players, currentUserId) {
  console.log(`Updating lastChat for all players of game ${gameId}`);
  const now = Date.now();
  const tableName2 = process.env.ABSTRACT_PLAY_TABLE;
  for (const pid of players.map((p) => p.id)) {
    if (await isBotId(pid)) {
      continue;
    }
    let data;
    let user;
    try {
      data = await ddbDocClient2.send(
        new GetCommand12({
          TableName: process.env.ABSTRACT_PLAY_TABLE,
          Key: {
            "pk": "USER",
            "sk": pid
          }
        })
      );
      if (data.Item !== void 0) {
        user = data.Item;
      }
    } catch (err) {
      logGetItemError(err);
      console.log(`Unable to get user data for user ${pid} when updating lastChat`);
      continue;
    }
    if (user === void 0) {
      console.log(`Unable to get user data for user ${pid} when updating lastChat`);
      continue;
    }
    const onCurrent = await hasCurrentGameRow(ddbDocClient2, tableName2, pid, gameId);
    if (onCurrent) {
      const overlay = { lastChat: now };
      if (pid === currentUserId) {
        overlay.seen = now + 10;
      }
      await upsertUserGameOverlay(
        ddbDocClient2,
        tableName2,
        pid,
        gameId,
        overlay
      );
      console.log(`Updated lastChat for user ${user.name} on game ${gameId}`);
    } else {
      console.log(`User ${user.name} does not have active game ${gameId} on dashboard; skipping overlay update`);
    }
  }
  await updateLastChatForWatchers(
    ddbDocClient2,
    process.env.ABSTRACT_PLAY_TABLE,
    gameId,
    currentUserId
  );
}
async function submitComment(userid, pars) {
  if (pars.comment.length === 0 || /^\s*$/.test(pars.comment)) {
    return formatReturnError(`Refusing to accept blank comment.`);
  }
  if (!pars.metaGame) {
    return formatReturnError(`metaGame is required.`);
  }
  try {
    const auth = await checkInGameCommentAuth(
      ddbDocClient2,
      process.env.ABSTRACT_PLAY_TABLE,
      userid,
      pars.metaGame,
      pars.id
    );
    if (!auth.ok) {
      return {
        statusCode: 401,
        body: JSON.stringify({ message: auth.message }),
        headers
      };
    }
  } catch (error2) {
    logGetItemError(error2);
    return formatReturnError(`Unable to verify permissions for user ${userid} on game ${pars.id}`);
  }
  let data;
  try {
    data = await ddbDocClient2.send(
      new GetCommand12({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "GAMECOMMENTS",
          "sk": pars.id
        }
      })
    );
  } catch (error2) {
    logGetItemError(error2);
    return formatReturnError(`Unable to get comments for game ${pars.id} from table ${process.env.ABSTRACT_PLAY_TABLE}`);
  }
  const commentsData = data.Item;
  console.log("got comments in submitComment:");
  console.log(commentsData);
  let comments;
  if (commentsData === void 0)
    comments = [];
  else
    comments = commentsData.comments;
  const hadInterestingCommentBefore = comments.some((c) => isInterestingComment(c.comment));
  if (comments.reduce((s, a) => s + 110 + Buffer.byteLength(a.comment, "utf8"), 0) < 36e4) {
    const comment = { "comment": pars.comment.substring(0, 4e3), "userId": userid, "moveNumber": pars.moveNumber, "timeStamp": Date.now() };
    comments.push(comment);
    await ddbDocClient2.send(new PutCommand10({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Item: {
        "pk": "GAMECOMMENTS",
        "sk": pars.id,
        "comments": comments
      }
    }));
    const newCommentIsInteresting = isInterestingComment(comment.comment);
    if (pars.metaGame && !hadInterestingCommentBefore && newCommentIsInteresting) {
      try {
        await ddbDocClient2.send(new UpdateCommand10({
          TableName: process.env.ABSTRACT_PLAY_TABLE,
          Key: {
            "pk": "GAME",
            "sk": pars.metaGame + "#0#" + pars.id
          },
          ExpressionAttributeValues: { ":c": 1 },
          UpdateExpression: "set commented = :c",
          ConditionExpression: "attribute_exists(pk) AND attribute_exists(sk)"
        }));
        console.log(`Updated commented flag to 1 for game ${pars.id} (first interesting comment added)`);
      } catch (error2) {
        console.log(`Failed to update commented flag for game ${pars.id}:`, error2);
      }
    }
  }
  if (pars.players && pars.metaGame) {
    await updateLastChatForPlayers(
      pars.id,
      pars.metaGame,
      pars.players,
      userid
    );
  }
  if (pars.metaGame) {
    await wsBroadcast("game", { "meta": pars.metaGame, "id": pars.id }, [userid]);
  }
  return {
    statusCode: 200,
    body: JSON.stringify({ success: true }),
    headers
  };
}
async function saveExploration(userid, pars) {
  let treeToSave = pars.tree;
  let gameVariants2;
  try {
    const gameData = await ddbDocClient2.send(new GetCommand12({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: {
        pk: "GAME",
        sk: pars.metaGame + "#" + (pars.public ? "1" : "0") + "#" + pars.game
      }
    }));
    if (gameData.Item !== void 0) {
      gameVariants2 = gameData.Item.variants;
    }
    if (gameData.Item?.state) {
      const game2 = hydrateGameState(gameData.Item);
      treeToSave = filterExplorationTreeForSave(
        pars.metaGame,
        game2.state,
        pars.move,
        pars.tree,
        pars.public
      );
    }
  } catch (error2) {
    console.warn(`Unable to filter exploration tree for game ${pars.game} move ${pars.move}:`, error2);
  }
  if (pars.updateCommentedFlag !== void 0 && pars.public && pars.gameEnded !== void 0) {
    try {
      await ddbDocClient2.send(new UpdateCommand10({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "COMPLETEDGAMES#" + pars.metaGame,
          "sk": pars.gameEnded + "#" + pars.game
        },
        ExpressionAttributeValues: { ":c": pars.updateCommentedFlag },
        UpdateExpression: "set commented = :c",
        ConditionExpression: "attribute_exists(pk) AND attribute_exists(sk)"
      }));
      console.log(`Updated commented flag for completed game ${pars.game} to ${pars.updateCommentedFlag}`);
    } catch (error2) {
      console.log(`Failed to update commented flag for completed game ${pars.game}:`, error2);
    }
  }
  if (pars.updateLastChat && pars.public && pars.players) {
    const chatPlayerIds = pars.players.map((p) => p.id);
    const chatSettings = await inAppSettingsMapForUserIds(chatPlayerIds);
    await enqueueCompletedGameChatNotifications(
      ddbDocClient2,
      process.env.ABSTRACT_PLAY_TABLE,
      pars.game,
      pars.metaGame,
      gameVariants2,
      pars.players.map((p) => ({ id: p.id, name: p.name ?? "Someone" })),
      userid,
      { settingsByUserId: chatSettings }
    );
  }
  if (!pars.public) {
    await ddbDocClient2.send(new PutCommand10({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Item: {
        "pk": "GAMEEXPLORATION#" + pars.game,
        "sk": userid + "#" + pars.move,
        "user": userid,
        "game": pars.game,
        "move": pars.move,
        "tree": JSON.stringify(treeToSave)
      }
    }));
  } else {
    try {
      console.log("Trying to update public exploration at key " + JSON.stringify({ "pk": "PUBLICEXPLORATION#" + pars.game, "sk": `${pars.move}` }));
      await ddbDocClient2.send(new UpdateCommand10({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: { "pk": "PUBLICEXPLORATION#" + pars.game, "sk": `${pars.move}` },
        ExpressionAttributeValues: { ":v": pars.version, ":inc": 1, ":t": JSON.stringify(treeToSave) },
        ExpressionAttributeNames: { "#v": "version", "#t": "tree" },
        ConditionExpression: "#v = :v",
        UpdateExpression: "set #v = :v + :inc, #t = :t"
      }));
    } catch (err) {
      if (err.name === "ConditionalCheckFailedException") {
        console.log("Failed to update public exploration, trying to get it.");
        const explorationData = await ddbDocClient2.send(
          new GetCommand12({
            TableName: process.env.ABSTRACT_PLAY_TABLE,
            Key: {
              "pk": "PUBLICEXPLORATION#" + pars.game,
              "sk": `${pars.move}`
            }
          })
        );
        let exploration = void 0;
        if (explorationData.Item === void 0) {
          console.log("Nothing here yet, try inserting.");
          try {
            await ddbDocClient2.send(new PutCommand10({
              TableName: process.env.ABSTRACT_PLAY_TABLE,
              Item: {
                "pk": "PUBLICEXPLORATION#" + pars.game,
                "sk": `${pars.move}`,
                "version": pars.version + 1,
                "game": pars.game,
                "tree": JSON.stringify(treeToSave)
              },
              ConditionExpression: "attribute_not_exists(sk)"
            }));
          } catch (error2) {
            if (err.name === "ConditionalCheckFailedException") {
              console.log("Wow, that was unlikely. Failed to insert public exploration, trying to get it.");
              const explorationData2 = await ddbDocClient2.send(
                new GetCommand12({
                  TableName: process.env.ABSTRACT_PLAY_TABLE,
                  Key: {
                    "pk": "PUBLICEXPLORATION#" + pars.game,
                    "sk": `${pars.move}`
                  }
                })
              );
              exploration = explorationData2.Item;
            } else {
              logGetItemError(err);
              return formatReturnError(`Unable to save exploration data for game ${pars.game} move ${pars.move}`);
            }
          }
          if (exploration === void 0) {
            console.log("Successfully inserted public exploration, returning to client.");
            return;
          }
        } else {
          exploration = explorationData.Item;
        }
        return {
          statusCode: 200,
          body: JSON.stringify(exploration),
          headers
        };
      } else {
        logGetItemError(err);
        return formatReturnError(`Unable to save exploration data for game ${pars.game} move ${pars.move}`);
      }
    }
  }
}
async function getExploration(userid, pars) {
  const work = [];
  let exploration;
  try {
    exploration = await ddbDocClient2.send(
      new GetCommand12({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "GAMEEXPLORATION#" + pars.game,
          "sk": userid + "#" + pars.move
        }
      })
    );
  } catch (error2) {
    logGetItemError(error2);
    return formatReturnError(`Unable to get exploration data for game ${pars.game} from table ${process.env.ABSTRACT_PLAY_TABLE}`);
  }
  const trees = [exploration.Item, ,];
  return {
    statusCode: 200,
    body: JSON.stringify(trees),
    headers
  };
}
async function getPrivateExploration(userid, pars) {
  let data;
  try {
    data = await ddbDocClient2.send(
      new QueryCommand9({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        KeyConditionExpression: "#pk = :pk and begins_with(#sk, :sk)",
        ExpressionAttributeValues: { ":pk": "GAMEEXPLORATION#" + pars.id, ":sk": userid + "#" },
        ExpressionAttributeNames: { "#pk": "pk", "#sk": "sk" }
      })
    );
  } catch (error2) {
    logGetItemError(error2);
    return formatReturnError(`Unable to get exploration data for game ${pars.id} from table ${process.env.ABSTRACT_PLAY_TABLE}`);
  }
  const trees = data.Items;
  return {
    statusCode: 200,
    body: JSON.stringify(trees),
    headers
  };
}
async function markAsPublished(userid, pars) {
  try {
    const data = await ddbDocClient2.send(
      new GetCommand12({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "GAME",
          "sk": pars.metagame + "#1#" + pars.id
        }
      })
    );
    if (!data.Item)
      throw new Error(`No game ${pars.metagame + "#1#" + pars.id} found in table ${process.env.ABSTRACT_PLAY_TABLE}`);
    const game2 = data.Item;
    if (!game2.players.find((p) => p.id === userid))
      throw new Error(`Only players can publish exploration!`);
    let published = [];
    if (game2.published)
      published = game2.published;
    if (published.includes(userid))
      throw new Error(`${userid} has already published for game ${pars.id}`);
    published.push(userid);
    await ddbDocClient2.send(new UpdateCommand10({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: { "pk": "GAME", "sk": pars.metagame + "#1#" + pars.id },
      ExpressionAttributeValues: { ":p": published },
      UpdateExpression: "set published = :p"
    }));
  } catch (error2) {
    logGetItemError(error2);
    return formatReturnError(`Unable to mark game ${pars.id} as published`);
  }
}
async function getPublicExploration(pars) {
  let data;
  try {
    data = await ddbDocClient2.send(
      new QueryCommand9({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        KeyConditionExpression: "#pk = :pk",
        ExpressionAttributeValues: { ":pk": "PUBLICEXPLORATION#" + pars.game },
        ExpressionAttributeNames: { "#pk": "pk" }
      })
    );
  } catch (error2) {
    logGetItemError(error2);
    return formatReturnError(`Unable to get public exploration data for game ${pars.game}`);
  }
  if (data.Items === void 0) {
    return;
  }
  console.log("Got public exploration data", data.Items);
  const trees = data.Items.map((d) => {
    return { move: d.sk, version: d.version, tree: d.tree };
  });
  return {
    statusCode: 200,
    body: JSON.stringify(trees),
    headers
  };
}
async function botMove(pars) {
  try {
    if (!(0, import_totp.validateToken)(process.env.TOTP_KEY, pars.token, 2)) {
      return formatReturnError(`Invalid token provided: ${JSON.stringify(pars)}`);
    }
  } catch (error2) {
    logGetItemError(error2);
    return formatReturnError(`Something went wrong while validating the token: ${JSON.stringify(pars)}`);
  }
  let game2;
  try {
    const data = await ddbDocClient2.send(
      new GetCommand12({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "GAME",
          "sk": pars.metaGame + "#0#" + pars.gameid
        }
      })
    );
    if (!data.Item)
      throw new Error(`No game ${pars.metaGame + "#0#" + pars.gameid} found in table ${process.env.ABSTRACT_PLAY_TABLE}`);
    game2 = hydrateGameState(data.Item);
  } catch (error2) {
    logGetItemError(error2);
    return formatReturnError(`Unable to load game ${pars.gameid} to make a bot move`);
  }
  if (game2 === void 0) {
    throw new Error("Unable to load game object");
  }
  const engine = GameFactory7(pars.metaGame, game2.state);
  if (!engine)
    throw new Error(`Unknown metaGame ${pars.metaGame}`);
  if (pars.move === "Swap") {
    return await invokePie(pars.uid, { id: pars.gameid, metaGame: pars.metaGame, cbit: 0 });
  } else if (pars.move === "resign") {
    return await submitMove(pars.uid, { id: pars.gameid, move: pars.move, metaGame: pars.metaGame, cbit: 0, draw: "" });
  } else {
    const realmove = engine.translateAiai(pars.move);
    if (realmove === "Swap") {
      return await invokePie(pars.uid, { id: pars.gameid, metaGame: pars.metaGame, cbit: 0 });
    }
    return await submitMove(pars.uid, { id: pars.gameid, move: realmove, metaGame: pars.metaGame, cbit: 0, draw: "" });
  }
}
async function handleMove(claims, pars) {
  const botId = claims.sub;
  console.log(`handleMove: Bot ${botId} is making move ${pars.move} in game ${pars.gameid}`);
  if (!pars.metaGame) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: "metaGame is required" }),
      headers
    };
  }
  const bot = await getBotRecord(botId);
  if (!bot) {
    return formatReturnError(`Unknown bot ${botId}`);
  }
  const game2 = await loadGameRecord(pars.metaGame, pars.gameid);
  if (!game2) {
    return formatReturnError(`Unable to load game ${pars.gameid}`);
  }
  if (!game2.players.some((p) => p.id === botId)) {
    return formatReturnError(`Bot ${botId} is not a player in game ${pars.gameid}`);
  }
  const info = gameinfo3.get(pars.metaGame);
  const simultaneous = info.flags !== void 0 && info.flags.includes("simultaneous");
  const toMoveIds = getToMovePlayerIds(game2, simultaneous);
  if (!toMoveIds.includes(botId)) {
    return formatReturnError(`It is not bot ${botId}'s turn in game ${pars.gameid}`);
  }
  return await submitMove(botId, {
    id: pars.gameid,
    move: pars.move,
    metaGame: pars.metaGame,
    cbit: 0,
    draw: ""
  });
}
async function newTournament(userid, pars) {
  const variantErr = validateChallengeVariantUids(pars.metaGame, pars.variants);
  if (variantErr) {
    return variantErr;
  }
  if (!tournamentPlaySupported(pars.metaGame)) {
    return formatReturnError(`Game ${pars.metaGame} does not support automated tournaments (requires playercount 2)`);
  }
  const variantsKey = pars.variants.sort().join("|");
  const sk = pars.metaGame + "#" + variantsKey;
  let tournamentN = 0;
  let available = true;
  try {
    const tournamentNumber = await ddbDocClient2.send(
      new GetCommand12({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "TOURNAMENTSCOUNTER",
          "sk": sk
        }
      })
    );
    if (tournamentNumber.Item !== void 0) {
      tournamentN = tournamentNumber.Item.count;
      available = tournamentNumber.Item.over;
    }
  } catch (err) {
    logGetItemError(err);
    return formatReturnError(`Unable to fetch TOURNAMENTSCOUNTER for '${sk}'`);
  }
  if (!available) {
    return formatReturnError(`There is already a tournament for '${pars.metaGame}#${variantsKey}'`);
  }
  try {
    await ddbDocClient2.send(new UpdateCommand10({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: { "pk": "TOURNAMENTSCOUNTER", "sk": sk },
      ExpressionAttributeValues: { ":val": tournamentN, ":inc": 1, ":zero": 0, ":f": false },
      ExpressionAttributeNames: { "#count": "count", "#over": "over" },
      ConditionExpression: "attribute_not_exists(#count) OR #count = :val",
      UpdateExpression: "set #count = if_not_exists(#count, :zero) + :inc, #over = :f"
    }));
  } catch (err) {
    if (err.name === "ConditionalCheckFailedException") {
      console.log(`Failed to update TOURNAMENTSCOUNTER for '${pars.metaGame}#${variantsKey}', count ${tournamentN} + 1`);
      return;
    }
    handleCommonErrors(err);
    console.log(err);
    return formatReturnError(`Unable to update TOURNAMENTSCOUNTER for '${pars.metaGame}#${variantsKey}', count ${tournamentN} + 1`);
  }
  const tournamentid = v4_default();
  const data = {
    "pk": "TOURNAMENT",
    "sk": tournamentid,
    "id": tournamentid,
    "metaGame": pars.metaGame,
    "variants": pars.variants,
    "number": tournamentN + 1,
    "started": false,
    "dateCreated": Date.now(),
    "datePreviousEnded": 0
  };
  try {
    await ddbDocClient2.send(new PutCommand10({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Item: data
    }));
  } catch (err) {
    handleCommonErrors(err);
    return formatReturnError(`Unable to insert tournament for '${pars.metaGame}#${variantsKey}', count ${tournamentN} + 1`);
  }
  const ret = await joinTournament(userid, { tournamentid });
  if (ret === void 0) {
    return {
      statusCode: 200,
      body: "New tournament created",
      headers
    };
  } else {
    return ret;
  }
}
async function joinTournament(userid, pars) {
  let tournament;
  let playername = "";
  let once = false;
  if (pars.once !== void 0 && pars.once) {
    once = true;
  }
  try {
    const tournamentGet = ddbDocClient2.send(
      new GetCommand12({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "TOURNAMENT",
          "sk": pars.tournamentid
        }
      })
    );
    const user = ddbDocClient2.send(
      new GetCommand12({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "USERS",
          "sk": userid
        }
      })
    );
    const [tournamentData, userData] = await Promise.all([tournamentGet, user]);
    if (!tournamentData.Item)
      throw new Error(`No tournament ${pars.tournamentid} found in table ${process.env.ABSTRACT_PLAY_TABLE}`);
    tournament = tournamentData.Item;
    playername = userData.Item.name;
  } catch (error2) {
    logGetItemError(error2);
    return formatReturnError(`Unable to get tournament ${pars.tournamentid} from table ${process.env.ABSTRACT_PLAY_TABLE}`);
  }
  if (tournament.started)
    return formatReturnError(`Tournament ${pars.tournamentid} has already started`);
  if (!tournamentPlaySupported(tournament.metaGame)) {
    return formatReturnError(`Game ${tournament.metaGame} does not support automated tournaments (requires playercount 2)`);
  }
  const sk = `${pars.tournamentid}#1#${userid}`;
  const data = {
    "pk": "TOURNAMENTPLAYER",
    "sk": sk,
    "playername": playername,
    "playerid": userid,
    "once": once
  };
  try {
    await ddbDocClient2.send(new PutCommand10({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Item: data
    }));
  } catch (err) {
    logGetItemError(err);
    return formatReturnError(`Unable to add player ${userid} to tournament ${pars.tournamentid}`);
  }
}
async function withdrawTournament(userid, pars) {
  let tournament;
  try {
    const tournamentData = await ddbDocClient2.send(
      new GetCommand12({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "TOURNAMENT",
          "sk": pars.tournamentid
        }
      })
    );
    if (!tournamentData.Item)
      throw new Error(`No tournament ${pars.tournamentid} found in table ${process.env.ABSTRACT_PLAY_TABLE}`);
    tournament = tournamentData.Item;
  } catch (error2) {
    logGetItemError(error2);
    return formatReturnError(`Unable to get tournament ${pars.tournamentid} from table ${process.env.ABSTRACT_PLAY_TABLE}`);
  }
  if (tournament.started)
    return formatReturnError(`Tournament ${pars.tournamentid} has already started`);
  const sk = `${pars.tournamentid}#1#${userid}`;
  try {
    await ddbDocClient2.send(
      new DeleteCommand9({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "TOURNAMENTPLAYER",
          "sk": sk
        }
      })
    );
  } catch (err) {
    logGetItemError(err);
    return formatReturnError(`Unable to withdraw player ${userid} from tournament ${pars.tournamentid}`);
  }
}
async function getTournaments() {
  try {
    const tournamentsDataPromise = ddbDocClient2.send(
      new QueryCommand9({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        KeyConditionExpression: "#pk = :pk",
        ExpressionAttributeValues: { ":pk": "TOURNAMENT" },
        ExpressionAttributeNames: { "#pk": "pk" }
      })
    );
    const tournamentPlayersDataPromise = ddbDocClient2.send(
      new QueryCommand9({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        KeyConditionExpression: "#pk = :pk",
        ExpressionAttributeValues: { ":pk": "TOURNAMENTPLAYER" },
        ExpressionAttributeNames: { "#pk": "pk" }
      })
    );
    const [tournamentsData, tournamentPlayersData] = await Promise.all([tournamentsDataPromise, tournamentPlayersDataPromise]);
    return {
      statusCode: 200,
      body: JSON.stringify({ tournaments: tournamentsData.Items, tournamentPlayers: tournamentPlayersData.Items }),
      headers
    };
  } catch (error2) {
    logGetItemError(error2);
    return formatReturnError(`Unable to get tournaments from table ${process.env.ABSTRACT_PLAY_TABLE}`);
  }
}
async function getOldTournaments(pars) {
  try {
    const tournamentsData = await ddbDocClient2.send(
      new QueryCommand9({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        ExpressionAttributeValues: { ":pk": "COMPLETEDTOURNAMENT", ":sk": pars.metaGame + "#" },
        ExpressionAttributeNames: { "#pk": "pk", "#sk": "sk" },
        KeyConditionExpression: "#pk = :pk and begins_with(#sk, :sk)"
      })
    );
    return {
      statusCode: 200,
      body: JSON.stringify({ tournaments: tournamentsData.Items }),
      headers
    };
  } catch (error2) {
    logGetItemError(error2);
    return formatReturnError(`Unable to get tournaments from table ${process.env.ABSTRACT_PLAY_TABLE}`);
  }
}
async function archiveTournaments() {
  try {
    const tournamentsData = await ddbDocClient2.send(
      new QueryCommand9({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        KeyConditionExpression: "#pk = :pk",
        ExpressionAttributeValues: { ":pk": "TOURNAMENT" },
        ExpressionAttributeNames: { "#pk": "pk" }
      })
    );
    const latestCompleted = /* @__PURE__ */ new Map();
    for (const tournament of tournamentsData.Items) {
      if (tournament.dateEnded !== void 0) {
        const key = tournament.metaGame + "#" + tournament.variants.sort().join("|");
        const latest = latestCompleted.get(key);
        if (latest === void 0 || tournament.dateEnded > latest) {
          latestCompleted.set(key, tournament.dateEnded);
        }
      }
    }
    const now = Date.now();
    const work = [];
    const list = [];
    for (const tournament of tournamentsData.Items) {
      if (tournament.dateEnded !== void 0) {
        const key = tournament.metaGame + "#" + tournament.variants.sort().join("|");
        if (tournament.dateEnded < latestCompleted.get(key) || tournament.dateEnded < now - 1e3 * 60 * 60 * 24 * 30 * 60) {
          work.push(archiveTournament(tournament));
          list.push(tournament.id);
        }
      }
    }
    await Promise.all(work);
    return {
      statusCode: 200,
      body: JSON.stringify({ message: "Archived old tournaments: " + list.join(", ") }),
      headers
    };
  } catch (error2) {
    logGetItemError(error2);
    return formatReturnError(`Unable to get tournaments from table ${process.env.ABSTRACT_PLAY_TABLE}`);
  }
}
async function archiveTournament(tournament) {
  try {
    const tournamentPlayersData = await ddbDocClient2.send(
      new QueryCommand9({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        ExpressionAttributeValues: { ":pk": "TOURNAMENTPLAYER", ":sk": tournament.id + "#" },
        ExpressionAttributeNames: { "#pk": "pk", "#sk": "sk" },
        KeyConditionExpression: "#pk = :pk and begins_with(#sk, :sk)"
      })
    );
    const players = tournamentPlayersData.Items;
    const tournamentGamesData = await ddbDocClient2.send(
      new QueryCommand9({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        ExpressionAttributeValues: { ":pk": "TOURNAMENTGAME", ":sk": tournament.id + "#" },
        ExpressionAttributeNames: { "#pk": "pk", "#sk": "sk" },
        KeyConditionExpression: "#pk = :pk and begins_with(#sk, :sk)"
      })
    );
    const tournamentGames = tournamentGamesData.Items;
    tournament.pk = "COMPLETEDTOURNAMENT";
    tournament.sk = tournament.metaGame + "#" + tournament.id;
    tournament.players = players;
    const work = [];
    work.push(ddbDocClient2.send(new PutCommand10({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Item: tournament
    })));
    const newTournamentRef = tournament.metaGame + "#" + tournament.id;
    for (const tournamentGame of tournamentGames) {
      work.push(ddbDocClient2.send(new UpdateCommand10({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: { "pk": "GAME", "sk": tournament.metaGame + "#1#" + tournamentGame.id },
        ExpressionAttributeValues: { ":newTournamentRef": newTournamentRef },
        UpdateExpression: "set tournament = :newTournamentRef"
      })));
    }
    work.push(ddbDocClient2.send(
      new DeleteCommand9({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "TOURNAMENT",
          "sk": tournament.id
        }
      })
    ));
    for (const player of players) {
      work.push(ddbDocClient2.send(
        new DeleteCommand9({
          TableName: process.env.ABSTRACT_PLAY_TABLE,
          Key: {
            "pk": "TOURNAMENTPLAYER",
            "sk": player.sk
          }
        })
      ));
    }
    return Promise.all(work);
  } catch (error2) {
    logGetItemError(error2);
  }
}
async function getTournament(pars) {
  try {
    const work = [];
    const isArchived = pars.isArchived === "true";
    let completedTournament = false;
    if (!isArchived) {
      work.push(ddbDocClient2.send(
        new QueryCommand9({
          TableName: process.env.ABSTRACT_PLAY_TABLE,
          ExpressionAttributeValues: { ":pk": "TOURNAMENT", ":sk": pars.tournamentid },
          ExpressionAttributeNames: { "#pk": "pk", "#sk": "sk" },
          KeyConditionExpression: "#pk = :pk and #sk = :sk"
        })
      ));
      work.push(ddbDocClient2.send(
        new QueryCommand9({
          TableName: process.env.ABSTRACT_PLAY_TABLE,
          ExpressionAttributeValues: { ":pk": "TOURNAMENTPLAYER", ":sk": pars.tournamentid + "#" },
          ExpressionAttributeNames: { "#pk": "pk", "#sk": "sk" },
          KeyConditionExpression: "#pk = :pk and begins_with(#sk, :sk)"
        })
      ));
    } else {
      work.push(ddbDocClient2.send(
        new QueryCommand9({
          TableName: process.env.ABSTRACT_PLAY_TABLE,
          ExpressionAttributeValues: { ":pk": "COMPLETEDTOURNAMENT", ":sk": pars.metaGame + "#" + pars.tournamentid },
          ExpressionAttributeNames: { "#pk": "pk", "#sk": "sk" },
          KeyConditionExpression: "#pk = :pk and #sk = :sk"
        })
      ));
      completedTournament = true;
    }
    work.push(ddbDocClient2.send(
      new QueryCommand9({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        ExpressionAttributeValues: { ":pk": "TOURNAMENTGAME", ":sk": pars.tournamentid + "#" },
        ExpressionAttributeNames: { "#pk": "pk", "#sk": "sk" },
        KeyConditionExpression: "#pk = :pk and begins_with(#sk, :sk)"
      })
    ));
    const data = await Promise.all(work);
    if (!isArchived && pars.metaGame !== "undefined" && data[0].Items.length === 0 && pars.gameId) {
      console.log(`Tournament ${pars.tournamentid} not found in active tournaments, trying completed tournaments`);
      const completedTournamentData = await ddbDocClient2.send(
        new QueryCommand9({
          TableName: process.env.ABSTRACT_PLAY_TABLE,
          ExpressionAttributeValues: { ":pk": "COMPLETEDTOURNAMENT", ":sk": pars.metaGame + "#" + pars.tournamentid },
          ExpressionAttributeNames: { "#pk": "pk", "#sk": "sk" },
          KeyConditionExpression: "#pk = :pk and #sk = :sk"
        })
      );
      if (completedTournamentData.Items && completedTournamentData.Items.length > 0) {
        console.log(`Found tournament ${pars.tournamentid} in completed tournaments, fixing game reference`);
        completedTournament = true;
        const newTournamentRef = pars.metaGame + "#" + pars.tournamentid;
        await ddbDocClient2.send(new UpdateCommand10({
          TableName: process.env.ABSTRACT_PLAY_TABLE,
          Key: { "pk": "GAME", "sk": pars.metaGame + "#1#" + pars.gameId },
          ExpressionAttributeValues: { ":newTournamentRef": newTournamentRef },
          UpdateExpression: "set tournament = :newTournamentRef"
        }));
        data[0] = completedTournamentData;
      }
    }
    if (!completedTournament) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          tournament: data[0].Items,
          tournamentPlayers: data[1]?.Items || [],
          tournamentGames: data[2].Items
        }),
        headers
      };
    } else {
      return {
        statusCode: 200,
        body: JSON.stringify({
          tournament: data[0].Items,
          tournamentPlayers: [],
          tournamentGames: isArchived ? data[1].Items : data[2].Items
        }),
        headers
      };
    }
  } catch (error2) {
    logGetItemError(error2);
    return formatReturnError(`Unable to get tournament ${pars.tournamentid}. Error: ${error2}`);
  }
}
async function endATournament(userId, pars) {
  try {
    const user = await ddbDocClient2.send(
      new GetCommand12({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "USER",
          "sk": userId
        }
      })
    );
    if (user.Item === void 0 || user.Item.admin !== true) {
      return {
        statusCode: 200,
        body: JSON.stringify({}),
        headers
      };
    }
  } catch (error2) {
    logGetItemError(error2);
    return formatReturnError(`Unable to get user ${userId}. Error: ${error2}`);
  }
  let tournament;
  try {
    const tournamentData = await ddbDocClient2.send(
      new GetCommand12({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "TOURNAMENT",
          "sk": pars.tournamentid
        }
      })
    );
    if (!tournamentData.Item)
      throw new Error(`No tournament ${pars.tournamentid} found in table ${process.env.ABSTRACT_PLAY_TABLE}`);
    tournament = tournamentData.Item;
  } catch (error2) {
    logGetItemError(error2);
    return formatReturnError(`Unable to get tournament ${pars.tournamentid} from table ${process.env.ABSTRACT_PLAY_TABLE}`);
  }
  return endTournament(tournament);
}
function tournamentDivisionNumber(player) {
  if (player.division !== void 0) {
    return player.division;
  }
  const parts = player.sk.split("#");
  if (parts.length >= 2) {
    const division = Number(parts[1]);
    if (Number.isFinite(division) && division > 0) {
      return division;
    }
  }
  return void 0;
}
function tournamentDivisionWinnerName(tournament, divisionNumber) {
  if (divisionNumber === void 0 || tournament.divisions === void 0) {
    return void 0;
  }
  return tournament.divisions[divisionNumber]?.winner;
}
async function endTournament(tournament) {
  try {
    if (tournament.divisions) {
      const work = [];
      let alldone = true;
      let tournamentUpdated = false;
      for (const [divisionNumber, division] of Object.entries(tournament.divisions)) {
        if (division.numCompleted < division.numGames) {
          alldone = false;
        }
        if (division.numCompleted === division.numGames && !division.processed) {
          const work2 = [];
          work2.push(sendCommandWithRetry(
            new QueryCommand9({
              TableName: process.env.ABSTRACT_PLAY_TABLE,
              KeyConditionExpression: "#pk = :pk and begins_with(#sk, :sk)",
              ExpressionAttributeValues: { ":pk": "TOURNAMENTGAME", ":sk": tournament.id + "#" + divisionNumber + "#" },
              ExpressionAttributeNames: { "#pk": "pk", "#sk": "sk" }
            })
          ));
          work2.push(sendCommandWithRetry(
            new QueryCommand9({
              TableName: process.env.ABSTRACT_PLAY_TABLE,
              ExpressionAttributeValues: { ":pk": "TOURNAMENTPLAYER", ":sk": tournament.id + "#" + divisionNumber + "#" },
              ExpressionAttributeNames: { "#pk": "pk", "#sk": "sk" },
              KeyConditionExpression: "#pk = :pk and begins_with(#sk, :sk)"
            })
          ));
          const [gamesData, playersData] = await Promise.all(work2);
          const gamelist = gamesData.Items;
          const players = playersData.Items;
          const tournamentPlayers = /* @__PURE__ */ new Map();
          for (let i = 0; i < players.length; i++) {
            players[i].tiebreak = 0;
            players[i].score = 0;
            tournamentPlayers.set(players[i].playerid, players[i]);
          }
          for (const game2 of gamelist) {
            if (game2.winner?.length === 2) {
              tournamentPlayers.get(game2.player1).score += 0.5;
              tournamentPlayers.get(game2.player2).score += 0.5;
            } else {
              tournamentPlayers.get(game2.winner[0]).score += 1;
            }
          }
          for (const game2 of gamelist) {
            if (game2.winner?.length === 2) {
              tournamentPlayers.get(game2.player1).tiebreak += tournamentPlayers.get(game2.player2).score / 2;
              tournamentPlayers.get(game2.player2).tiebreak += tournamentPlayers.get(game2.player1).score / 2;
            } else if (game2.winner[0] === game2.player1) {
              tournamentPlayers.get(game2.player1).tiebreak += tournamentPlayers.get(game2.player2).score;
            } else {
              tournamentPlayers.get(game2.player2).tiebreak += tournamentPlayers.get(game2.player1).score;
            }
          }
          let bestScore = 0;
          let bestTiebreak = 0;
          let bestRating = 0;
          let bestPlayer = "";
          let bestPlayerName = "";
          for (const player of players) {
            if (player.score > bestScore) {
              bestScore = player.score;
              bestTiebreak = player.tiebreak;
              bestRating = player.rating;
              bestPlayer = player.playerid;
              bestPlayerName = player.playername;
            } else if (player.score === bestScore) {
              if (player.tiebreak > bestTiebreak) {
                bestTiebreak = player.tiebreak;
                bestRating = player.rating;
                bestPlayer = player.playerid;
                bestPlayerName = player.playername;
              } else if (player.tiebreak === bestTiebreak) {
                if (player.rating > bestRating) {
                  bestRating = player.rating;
                  bestPlayer = player.playerid;
                  bestPlayerName = player.playername;
                }
              }
            }
          }
          division.processed = true;
          division.winnerid = bestPlayer;
          division.winner = bestPlayerName;
          for (const player of players) {
            work.push(sendCommandWithRetry(new UpdateCommand10({
              TableName: process.env.ABSTRACT_PLAY_TABLE,
              Key: { "pk": "TOURNAMENTPLAYER", "sk": `${tournament.id}#${divisionNumber}#${player.playerid}` },
              ExpressionAttributeNames: { "#t": "tiebreak" },
              ExpressionAttributeValues: { ":t": player.tiebreak },
              UpdateExpression: "set #t = :t"
            })));
            if (player.timeout) {
              work.push(sendCommandWithRetry(new UpdateCommand10({
                TableName: process.env.ABSTRACT_PLAY_TABLE,
                Key: { "pk": "TOURNAMENTPLAYER", "sk": `${tournament.nextid}#1#${player.playerid}` },
                ExpressionAttributeNames: { "#t": "timeout" },
                ExpressionAttributeValues: { ":t": true },
                UpdateExpression: "set #t = :t",
                ConditionExpression: "attribute_exists(pk) AND attribute_exists(sk)"
              })).catch((error2) => {
                if (error2.name === "ConditionalCheckFailedException") {
                  console.log(`Player ${player.playerid} already left the next tournament, so no need to record timeout.`);
                } else {
                  throw error2;
                }
              }));
            }
          }
          tournamentUpdated = true;
        }
      }
      if (tournamentUpdated) {
        if (!alldone) {
          work.push(sendCommandWithRetry(new UpdateCommand10({
            TableName: process.env.ABSTRACT_PLAY_TABLE,
            Key: { "pk": "TOURNAMENT", "sk": tournament.id },
            ExpressionAttributeValues: { ":ds": tournament.divisions },
            UpdateExpression: "set divisions = :ds"
          })));
        } else {
          const now = Date.now();
          work.push(sendCommandWithRetry(new UpdateCommand10({
            TableName: process.env.ABSTRACT_PLAY_TABLE,
            Key: { "pk": "TOURNAMENT", "sk": tournament.id },
            ExpressionAttributeValues: { ":ds": tournament.divisions, ":dt": now },
            UpdateExpression: "set divisions = :ds, dateEnded = :dt"
          })));
          work.push(sendCommandWithRetry(new UpdateCommand10({
            TableName: process.env.ABSTRACT_PLAY_TABLE,
            Key: { "pk": "TOURNAMENT", "sk": tournament.nextid },
            ExpressionAttributeValues: { ":dt": now },
            UpdateExpression: "set datePreviousEnded = :dt"
          })));
          const playersData = await sendCommandWithRetry(
            new QueryCommand9({
              TableName: process.env.ABSTRACT_PLAY_TABLE,
              ExpressionAttributeValues: { ":pk": "TOURNAMENTPLAYER", ":sk": tournament.id },
              ExpressionAttributeNames: { "#pk": "pk", "#sk": "sk" },
              KeyConditionExpression: "#pk = :pk and begins_with(#sk, :sk)"
            })
          );
          const players = playersData.Items;
          const playersById = new Map(players.map((p) => [p.playerid, p]));
          const playersFull = await getPlayers(players.map((p) => p.playerid));
          await initi18n("en");
          const metaGameName = gameinfo3.get(tournament.metaGame)?.name;
          const tableName2 = process.env.ABSTRACT_PLAY_TABLE;
          for (const player of playersFull) {
            const tournamentPlayer = playersById.get(player.id);
            const divisionNumber = tournamentPlayer ? tournamentDivisionNumber(tournamentPlayer) : void 0;
            const winnerName = tournamentDivisionWinnerName(tournament, divisionNumber);
            work.push(createNotification(ddbDocClient2, tableName2, player.id, {
              type: "tournamentEnd",
              tournamentId: tournament.id,
              metaGame: tournament.metaGame,
              number: tournament.number,
              variants: tournament.variants ?? [],
              ...winnerName ? { winnerName } : {}
            }, {
              userSettings: player.settings
            }));
            console.log(`Determining whether to send tournamentEnd email to the following player:
${JSON.stringify(player)}`);
            if (player.settings?.all?.notifications === void 0 || !player.settings.all.notifications.hasOwnProperty("tournamentEnd") || player.settings.all.notifications.tournamentEnd) {
              console.log("Sending email");
              await changeLanguageForPlayer(player);
              let body = "";
              if (tournament.variants.length === 0)
                body = instance.t("TournamentEndBody", { "metaGame": metaGameName, "number": tournament.number, "tournamentId": tournament.id });
              else
                body = instance.t("TournamentEndBodyVariants", { "metaGame": metaGameName, "number": tournament.number, "tournamentId": tournament.id, "variants": tournament.variants.join(", ") });
              if (player.email !== void 0 && player.email !== null && player.email !== "") {
                const comm = createSendEmailCommand(player.email, player.name, instance.t("TournamentEndSubject", { "metaGame": metaGameName }), body);
                work.push(sesClient.send(comm));
              }
              work.push(sendPush({
                userId: player.id,
                topic: "tournament",
                title: instance.t("PUSH.titles.tournamentOver"),
                body,
                url: `/tournament/${tournament.id}`
              }));
            }
          }
        }
      }
    }
  } catch (error2) {
    logGetItemError(error2);
    return formatReturnError(`Error during update tournament ${tournament.id}: {error}`);
  }
  return {
    statusCode: 200,
    body: "Done",
    headers
  };
}
async function eventGetEvent(pars) {
  try {
    const event = await ddbDocClient2.send(
      new GetCommand12({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "ORGEVENT",
          "sk": pars.eventid
        }
      })
    );
    if (event.Item === void 0) {
      return {
        statusCode: 404,
        headers
      };
    }
    const players = await ddbDocClient2.send(
      new QueryCommand9({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        KeyConditionExpression: "#pk = :pk and begins_with(#sk, :sk)",
        ExpressionAttributeValues: { ":pk": "ORGEVENTPLAYER", ":sk": pars.eventid },
        ExpressionAttributeNames: { "#pk": "pk", "#sk": "sk" }
      })
    );
    const games2 = await ddbDocClient2.send(
      new QueryCommand9({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        KeyConditionExpression: "#pk = :pk and begins_with(#sk, :sk)",
        ExpressionAttributeValues: { ":pk": "ORGEVENTGAME", ":sk": pars.eventid },
        ExpressionAttributeNames: { "#pk": "pk", "#sk": "sk" }
      })
    );
    return {
      statusCode: 200,
      body: JSON.stringify({ event: event.Item, players: players.Items, games: games2.Items }),
      headers
    };
  } catch (error2) {
    logGetItemError(error2);
    return formatReturnError(`Unable to get organized event ${pars.eventid}. Error: ${error2}`);
  }
}
async function eventGetEvents() {
  try {
    const work = [];
    work.push(ddbDocClient2.send(
      new QueryCommand9({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        KeyConditionExpression: "#pk = :pk",
        ExpressionAttributeValues: { ":pk": "ORGEVENT" },
        ExpressionAttributeNames: { "#pk": "pk" }
      })
    ));
    work.push(ddbDocClient2.send(
      new QueryCommand9({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        KeyConditionExpression: "#pk = :pk",
        ExpressionAttributeValues: { ":pk": "ORGEVENTPLAYER" },
        ExpressionAttributeNames: { "#pk": "pk" }
      })
    ));
    work.push(ddbDocClient2.send(
      new QueryCommand9({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        KeyConditionExpression: "#pk = :pk",
        ExpressionAttributeValues: { ":pk": "ORGEVENTGAME" },
        ExpressionAttributeNames: { "#pk": "pk" }
      })
    ));
    const data = await Promise.all(work);
    return {
      statusCode: 200,
      body: JSON.stringify({ events: data[0].Items, players: data[1].Items, games: data[2].Items }),
      headers
    };
  } catch (error2) {
    logGetItemError(error2);
    return formatReturnError(`Unable to get organized events. Error: ${error2}`);
  }
}
async function eventCreate(userid, pars) {
  try {
    const user = await ddbDocClient2.send(
      new GetCommand12({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "USER",
          "sk": userid
        }
      })
    );
    if (user.Item === void 0 || user.Item.admin !== true && user.Item.organizer !== true) {
      return {
        statusCode: 200,
        body: JSON.stringify({}),
        headers
      };
    }
  } catch (err) {
    logGetItemError(err);
    return formatReturnError(`createEvent: Unable to load user record to authorize ${userid}`);
  }
  try {
    const eventid = v4_default();
    const eventRec = {
      pk: "ORGEVENT",
      sk: eventid,
      name: pars.name,
      description: pars.description,
      organizer: userid,
      dateStart: pars.date,
      visible: false,
      invited: [],
      blocked: [],
      maxPlayers: pars.maxPlayers
    };
    await ddbDocClient2.send(
      new PutCommand10({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Item: eventRec
      })
    );
    return {
      statusCode: 200,
      body: JSON.stringify({ eventid }),
      headers
    };
  } catch (error2) {
    logGetItemError(error2);
    return formatReturnError(`Unable to create event. Error: ${error2}`);
  }
}
async function eventPublish(userid, pars) {
  let userRec;
  try {
    const user = await ddbDocClient2.send(
      new GetCommand12({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "USER",
          "sk": userid
        }
      })
    );
    if (user.Item === void 0 || user.Item.admin !== true && user.Item.organizer !== true) {
      return {
        statusCode: 401,
        headers
      };
    }
    userRec = user.Item;
  } catch (err) {
    logGetItemError(err);
    return formatReturnError(`createEvent: Unable to load user record to authorize ${userid}`);
  }
  try {
    const event = await ddbDocClient2.send(
      new GetCommand12({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "ORGEVENT",
          "sk": pars.eventid
        }
      })
    );
    if (event.Item === void 0) {
      return {
        statusCode: 404,
        headers
      };
    }
    const eventRec = event.Item;
    if (userRec === void 0 || userRec.admin !== true && eventRec.organizer !== userid) {
      return {
        statusCode: 401,
        headers
      };
    }
    if (eventRec.dateStart <= Date.now() || /^\s*$/.test(eventRec.description)) {
      return {
        statusCode: 400,
        body: "The start date must be in the future and the description may not be empty.",
        headers
      };
    }
    eventRec.visible = true;
    await ddbDocClient2.send(
      new PutCommand10({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Item: eventRec
      })
    );
    return {
      statusCode: 200,
      body: JSON.stringify(eventRec),
      headers
    };
  } catch (error2) {
    logGetItemError(error2);
    return formatReturnError(`Unable to publish event ${pars.eventid}. Error: ${error2}`);
  }
}
async function eventDelete(userid, pars) {
  let userRec;
  try {
    const user = await ddbDocClient2.send(
      new GetCommand12({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "USER",
          "sk": userid
        }
      })
    );
    if (user.Item === void 0 || user.Item.admin !== true && user.Item.organizer !== true) {
      return {
        statusCode: 401,
        headers
      };
    }
    userRec = user.Item;
  } catch (err) {
    logGetItemError(err);
    return formatReturnError(`createEvent: Unable to load user record to authorize ${userid}`);
  }
  try {
    const event = await ddbDocClient2.send(
      new GetCommand12({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "ORGEVENT",
          "sk": pars.eventid
        }
      })
    );
    if (event.Item === void 0) {
      return {
        statusCode: 404,
        headers
      };
    }
    const eventRec = event.Item;
    if (userRec === void 0 || userRec.admin !== true && eventRec.organizer !== userid) {
      return {
        statusCode: 401,
        headers
      };
    }
    const players = await ddbDocClient2.send(
      new QueryCommand9({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        KeyConditionExpression: "#pk = :pk and begins_with(#sk, :sk)",
        ExpressionAttributeValues: { ":pk": "ORGEVENTPLAYER", ":sk": pars.eventid },
        ExpressionAttributeNames: { "#pk": "pk", "#sk": "sk" }
      })
    );
    const games2 = await ddbDocClient2.send(
      new QueryCommand9({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        KeyConditionExpression: "#pk = :pk and begins_with(#sk, :sk)",
        ExpressionAttributeValues: { ":pk": "ORGEVENTGAME", ":sk": pars.eventid },
        ExpressionAttributeNames: { "#pk": "pk", "#sk": "sk" }
      })
    );
    if (eventRec.dateEnd !== void 0 || games2.Items !== void 0 && games2.Items.length > 0) {
      return {
        statusCode: 400,
        body: "You cannot delete events that are over or that have associated games.",
        headers
      };
    }
    if (players.Items !== void 0 && players.Items.length > 0) {
      for (const { playerid } of players.Items) {
        await ddbDocClient2.send(
          new DeleteCommand9({
            TableName: process.env.ABSTRACT_PLAY_TABLE,
            Key: {
              "pk": "ORGEVENTPLAYER",
              "sk": `${pars.eventid}#${playerid}`
            }
          })
        );
      }
    }
    await ddbDocClient2.send(
      new DeleteCommand9({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "ORGEVENT",
          "sk": pars.eventid
        }
      })
    );
    return {
      statusCode: 200,
      headers
    };
  } catch (error2) {
    logGetItemError(error2);
    return formatReturnError(`Unable to delete event ${pars.eventid}. Error: ${error2}`);
  }
}
async function eventRegister(userid, pars) {
  try {
    const event = await ddbDocClient2.send(
      new GetCommand12({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "ORGEVENT",
          "sk": pars.eventid
        }
      })
    );
    if (event.Item === void 0) {
      return {
        statusCode: 404,
        headers
      };
    }
    const eventRec = event.Item;
    if (!eventRec.visible || eventRec.dateStart < Date.now() || eventRec.dateEnd !== void 0) {
      return {
        statusCode: 400,
        body: "You may only register for events that are open for registration.",
        headers
      };
    }
    if (eventRec.blocked !== void 0 && eventRec.blocked.includes(userid)) {
      return {
        statusCode: 400,
        body: "You are blocked from registering for this event.",
        headers
      };
    }
    if (eventRec.invited !== void 0 && eventRec.invited.length > 0 && !eventRec.invited.includes(userid)) {
      return {
        statusCode: 400,
        body: "This event is by invitation only.",
        headers
      };
    }
    if (eventRec.maxPlayers > 0) {
      const players = await ddbDocClient2.send(
        new QueryCommand9({
          TableName: process.env.ABSTRACT_PLAY_TABLE,
          KeyConditionExpression: "#pk = :pk and begins_with(#sk, :sk)",
          ExpressionAttributeValues: { ":pk": "ORGEVENTPLAYER", ":sk": pars.eventid },
          ExpressionAttributeNames: { "#pk": "pk", "#sk": "sk" },
          Select: "COUNT"
        })
      );
      if (players.Count !== void 0 && players.Count >= eventRec.maxPlayers) {
        return {
          statusCode: 400,
          body: "This event is full.",
          headers
        };
      }
    }
    const newRec = {
      pk: "ORGEVENTPLAYER",
      sk: `${pars.eventid}#${userid}`,
      playerid: userid
    };
    await ddbDocClient2.send(
      new PutCommand10({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Item: newRec
      })
    );
    return {
      statusCode: 200,
      body: JSON.stringify(newRec),
      headers
    };
  } catch (error2) {
    logGetItemError(error2);
    return formatReturnError(`Unable to register for event ${pars.eventid}. Error: ${error2}`);
  }
}
async function eventWithdraw(userid, pars) {
  try {
    const event = await ddbDocClient2.send(
      new GetCommand12({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "ORGEVENT",
          "sk": pars.eventid
        }
      })
    );
    if (event.Item === void 0) {
      return {
        statusCode: 404,
        headers
      };
    }
    const eventRec = event.Item;
    if (!eventRec.visible || eventRec.dateStart < Date.now() || eventRec.dateEnd !== void 0) {
      return {
        statusCode: 400,
        body: "You may only withdraw from events that are open for registration.",
        headers
      };
    }
    await ddbDocClient2.send(
      new DeleteCommand9({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "ORGEVENTPLAYER",
          "sk": `${pars.eventid}#${userid}`
        }
      })
    );
    return {
      statusCode: 200,
      headers
    };
  } catch (error2) {
    logGetItemError(error2);
    return formatReturnError(`Unable to withdraw from event ${pars.eventid}. Error: ${error2}`);
  }
}
async function eventUpdateStart(userid, pars) {
  let userRec;
  try {
    const user = await ddbDocClient2.send(
      new GetCommand12({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "USER",
          "sk": userid
        }
      })
    );
    if (user.Item === void 0 || user.Item.admin !== true && user.Item.organizer !== true) {
      return {
        statusCode: 401,
        headers
      };
    }
    userRec = user.Item;
  } catch (err) {
    logGetItemError(err);
    return formatReturnError(`createEvent: Unable to load user record to authorize ${userid}`);
  }
  try {
    const event = await ddbDocClient2.send(
      new GetCommand12({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "ORGEVENT",
          "sk": pars.eventid
        }
      })
    );
    if (event.Item === void 0) {
      return {
        statusCode: 404,
        headers
      };
    }
    const eventRec = event.Item;
    if (userRec === void 0 || userRec.admin !== true && eventRec.organizer !== userid) {
      return {
        statusCode: 401,
        headers
      };
    }
    eventRec.dateStart = pars.newDate;
    await ddbDocClient2.send(
      new PutCommand10({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Item: eventRec
      })
    );
    return {
      statusCode: 200,
      body: JSON.stringify(eventRec),
      headers
    };
  } catch (error2) {
    logGetItemError(error2);
    return formatReturnError(`Unable to update event start date. Error: ${error2}`);
  }
}
async function eventUpdateName(userid, pars) {
  let userRec;
  try {
    const user = await ddbDocClient2.send(
      new GetCommand12({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "USER",
          "sk": userid
        }
      })
    );
    if (user.Item === void 0 || user.Item.admin !== true && user.Item.organizer !== true) {
      return {
        statusCode: 401,
        headers
      };
    }
    userRec = user.Item;
  } catch (err) {
    logGetItemError(err);
    return formatReturnError(`createEvent: Unable to load user record to authorize ${userid}`);
  }
  try {
    const event = await ddbDocClient2.send(
      new GetCommand12({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "ORGEVENT",
          "sk": pars.eventid
        }
      })
    );
    if (event.Item === void 0) {
      return {
        statusCode: 404,
        headers
      };
    }
    const eventRec = event.Item;
    if (userRec === void 0 || userRec.admin !== true && eventRec.organizer !== userid) {
      return {
        statusCode: 401,
        headers
      };
    }
    eventRec.name = pars.name;
    await ddbDocClient2.send(
      new PutCommand10({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Item: eventRec
      })
    );
    return {
      statusCode: 200,
      body: JSON.stringify(eventRec),
      headers
    };
  } catch (error2) {
    logGetItemError(error2);
    return formatReturnError(`Unable to update event start date. Error: ${error2}`);
  }
}
async function eventUpdateDesc(userid, pars) {
  let userRec;
  try {
    const user = await ddbDocClient2.send(
      new GetCommand12({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "USER",
          "sk": userid
        }
      })
    );
    if (user.Item === void 0 || user.Item.admin !== true && user.Item.organizer !== true) {
      return {
        statusCode: 401,
        headers
      };
    }
    userRec = user.Item;
  } catch (err) {
    logGetItemError(err);
    return formatReturnError(`createEvent: Unable to load user record to authorize ${userid}`);
  }
  try {
    const event = await ddbDocClient2.send(
      new GetCommand12({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "ORGEVENT",
          "sk": pars.eventid
        }
      })
    );
    if (event.Item === void 0) {
      return {
        statusCode: 404,
        headers
      };
    }
    const eventRec = event.Item;
    if (userRec === void 0 || userRec.admin !== true && eventRec.organizer !== userid) {
      return {
        statusCode: 401,
        headers
      };
    }
    eventRec.description = pars.description;
    await ddbDocClient2.send(
      new PutCommand10({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Item: eventRec
      })
    );
    return {
      statusCode: 200,
      body: JSON.stringify(eventRec),
      headers
    };
  } catch (error2) {
    logGetItemError(error2);
    return formatReturnError(`Unable to update event start date. Error: ${error2}`);
  }
}
async function eventUpdateInvites(userid, pars) {
  let userRec;
  try {
    const user = await ddbDocClient2.send(
      new GetCommand12({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "USER",
          "sk": userid
        }
      })
    );
    if (user.Item === void 0 || user.Item.admin !== true && user.Item.organizer !== true) {
      return {
        statusCode: 401,
        headers
      };
    }
    userRec = user.Item;
  } catch (err) {
    logGetItemError(err);
    return formatReturnError(`eventUpdateInvites: Unable to load user record to authorize ${userid}`);
  }
  try {
    const event = await ddbDocClient2.send(
      new GetCommand12({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "ORGEVENT",
          "sk": pars.eventid
        }
      })
    );
    if (event.Item === void 0) {
      return {
        statusCode: 404,
        headers
      };
    }
    const eventRec = event.Item;
    if (userRec === void 0 || userRec.admin !== true && eventRec.organizer !== userid) {
      return {
        statusCode: 401,
        headers
      };
    }
    const previousInvited = new Set(eventRec.invited ?? []);
    const invited = Array.isArray(pars.invited) ? pars.invited : [];
    const blocked = Array.isArray(pars.blocked) ? pars.blocked : [];
    eventRec.invited = invited;
    eventRec.blocked = blocked;
    await ddbDocClient2.send(
      new PutCommand10({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Item: eventRec
      })
    );
    const tableName2 = process.env.ABSTRACT_PLAY_TABLE;
    const newlyInvited = invited.filter((id) => !previousInvited.has(id));
    const toNotify = await resolveEventInvitationNotifyIds(
      ddbDocClient2,
      tableName2,
      invited,
      newlyInvited,
      pars.eventid
    );
    const inviteeSettings = await inAppSettingsMapForUserIds(toNotify);
    await enqueueEventInvitationNotifications(
      ddbDocClient2,
      tableName2,
      toNotify,
      {
        eventId: pars.eventid,
        eventName: eventRec.name,
        organizerId: userid,
        organizerName: userRec.name
      },
      inviteeSettings
    );
    return {
      statusCode: 200,
      body: JSON.stringify(eventRec),
      headers
    };
  } catch (error2) {
    logGetItemError(error2);
    return formatReturnError(`Unable to update event invites. Error: ${error2}`);
  }
}
async function eventUpdateResult(userid, pars) {
  let userRec;
  try {
    const user = await ddbDocClient2.send(
      new GetCommand12({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "USER",
          "sk": userid
        }
      })
    );
    if (user.Item === void 0 || user.Item.admin !== true && user.Item.organizer !== true) {
      console.log(`Error 401`);
      return {
        statusCode: 401,
        headers
      };
    }
    userRec = user.Item;
  } catch (err) {
    logGetItemError(err);
    return formatReturnError(`eventCreateGames: Unable to load user record to authorize ${userid}`);
  }
  let event;
  try {
    const eventRec = await ddbDocClient2.send(
      new GetCommand12({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "ORGEVENT",
          "sk": pars.eventid
        }
      })
    );
    if (eventRec.Item === void 0) {
      console.log(`Error 404`);
      return {
        statusCode: 404,
        headers
      };
    }
    event = eventRec.Item;
    if (userRec === void 0 || userRec.admin !== true && event.organizer !== userid) {
      console.log(`Error 401`);
      return {
        statusCode: 401,
        headers
      };
    }
  } catch (error2) {
    logGetItemError(error2);
    return formatReturnError(`eventCreateGames: Unable to load/validate the event record for event ${pars.eventid}. Error: ${error2}`);
  }
  try {
    await ddbDocClient2.send(new UpdateCommand10({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: { "pk": "ORGEVENTGAME", "sk": `${pars.eventid}#${pars.gameid}` },
      ExpressionAttributeValues: { ":win": pars.result, ":arb": true },
      UpdateExpression: "set winner = :win, arbitrated = :arb"
    }));
    return {
      statusCode: 200,
      headers
    };
  } catch (err) {
    logGetItemError(err);
    return formatReturnError(`eventUpdateResult: Unable to set result ${pars.result} for ${pars.eventid}#${pars.gameid}`);
  }
}
async function eventUpdateDivisions(userid, pars) {
  console.log(`About to try updating division assignments for event ${pars.eventid}:
${JSON.stringify(pars.divisions, null, 2)}`);
  let userRec;
  try {
    const user = await ddbDocClient2.send(
      new GetCommand12({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "USER",
          "sk": userid
        }
      })
    );
    if (user.Item === void 0 || user.Item.admin !== true && user.Item.organizer !== true) {
      console.log(`Error 401`);
      return {
        statusCode: 401,
        headers
      };
    }
    userRec = user.Item;
  } catch (err) {
    logGetItemError(err);
    return formatReturnError(`eventCreateGames: Unable to load user record to authorize ${userid}`);
  }
  let event;
  try {
    const eventRec = await ddbDocClient2.send(
      new GetCommand12({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "ORGEVENT",
          "sk": pars.eventid
        }
      })
    );
    if (eventRec.Item === void 0) {
      console.log(`Error 404`);
      return {
        statusCode: 404,
        headers
      };
    }
    event = eventRec.Item;
    if (userRec === void 0 || userRec.admin !== true && event.organizer !== userid) {
      console.log(`Error 401`);
      return {
        statusCode: 401,
        headers
      };
    }
  } catch (error2) {
    logGetItemError(error2);
    return formatReturnError(`eventCreateGames: Unable to load/validate the event record for event ${pars.eventid}. Error: ${error2}`);
  }
  let eventPlayers;
  try {
    const pRecs = await ddbDocClient2.send(
      new QueryCommand9({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        KeyConditionExpression: "#pk = :pk and begins_with(#sk, :sk)",
        ExpressionAttributeValues: { ":pk": "ORGEVENTPLAYER", ":sk": pars.eventid },
        ExpressionAttributeNames: { "#pk": "pk", "#sk": "sk" }
      })
    );
    if (pRecs.Items === void 0 || pRecs.Items.length === 0) {
      console.log(`Error 400: No players`);
      return {
        statusCode: 400,
        body: "This event has no registered players!",
        headers
      };
    }
    eventPlayers = pRecs.Items;
  } catch (error2) {
    logGetItemError(error2);
    return formatReturnError(`eventCreateGames: Unable to load registered players for event ${pars.eventid}. Error: ${error2}`);
  }
  if (pars.divisions.length < 2) {
    console.log(`Error 400: Too few divisions`);
    return {
      statusCode: 400,
      body: `There must be at least two divisions.`,
      headers
    };
  }
  if (Math.min(...pars.divisions.map((d) => d.length)) < 2) {
    console.log(`Error 400: Too-small division`);
    return {
      statusCode: 400,
      body: `Each division must have at least two players assigned.`,
      headers
    };
  }
  const idsRegistered = eventPlayers.map((p) => p.playerid);
  for (const uid of pars.divisions.flat()) {
    if (!idsRegistered.includes(uid)) {
      console.log(`Error 400: Unregistered player`);
      return {
        statusCode: 400,
        body: `You may not assign divisions to players not registered for this event.`,
        headers
      };
    }
  }
  const setRegistrants = new Set(idsRegistered);
  for (const uid of pars.divisions.flat()) {
    setRegistrants.delete(uid);
  }
  if (setRegistrants.size > 0) {
    console.log(`Error 400: Not all players assigned`);
    return {
      statusCode: 400,
      body: `All registered players must be assigned to a division.`,
      headers
    };
  }
  const seen = new Set(pars.divisions.flat());
  if (seen.size < pars.divisions.flat().length) {
    console.log(`Error 400: Duplicates`);
    return {
      statusCode: 400,
      body: `Players must only be assigned to one division. No duplicates allowed.`,
      headers
    };
  }
  const list = [];
  try {
    for (let d = 0; d < pars.divisions.length; d++) {
      const division = pars.divisions[d];
      for (const pid of division) {
        const cmd = ddbDocClient2.send(new UpdateCommand10({
          TableName: process.env.ABSTRACT_PLAY_TABLE,
          Key: { "pk": "ORGEVENTPLAYER", "sk": `${pars.eventid}#${pid}` },
          ExpressionAttributeValues: { ":div": d + 1 },
          UpdateExpression: "set division = :div"
        }));
        list.push(cmd);
      }
    }
  } catch (error2) {
    logGetItemError(error2);
    return formatReturnError(`eventUpdateDivisions: Something went wrong assigning divisions for event ${pars.eventid}. Error: ${error2}`);
  }
  try {
    await Promise.all(list);
    return {
      statusCode: 200,
      headers
    };
  } catch (error2) {
    logGetItemError(error2);
    throw new Error(`Something terrible happened while trying to assign divisions for event ${pars.eventid}`);
  }
}
async function eventCreateGames(userid, pars) {
  console.log(`About to try creating the following pairings for event ${pars.eventid}:
${JSON.stringify(pars.pairs, null, 2)}`);
  let userRec;
  try {
    const user = await ddbDocClient2.send(
      new GetCommand12({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "USER",
          "sk": userid
        }
      })
    );
    if (user.Item === void 0 || user.Item.admin !== true && user.Item.organizer !== true) {
      console.log(`Error 401`);
      return {
        statusCode: 401,
        headers
      };
    }
    userRec = user.Item;
  } catch (err) {
    logGetItemError(err);
    return formatReturnError(`eventCreateGames: Unable to load user record to authorize ${userid}`);
  }
  let event;
  try {
    const eventRec = await ddbDocClient2.send(
      new GetCommand12({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "ORGEVENT",
          "sk": pars.eventid
        }
      })
    );
    if (eventRec.Item === void 0) {
      console.log(`Error 404`);
      return {
        statusCode: 404,
        headers
      };
    }
    event = eventRec.Item;
    if (userRec === void 0 || userRec.admin !== true && event.organizer !== userid) {
      console.log(`Error 401`);
      return {
        statusCode: 401,
        headers
      };
    }
  } catch (error2) {
    logGetItemError(error2);
    return formatReturnError(`eventCreateGames: Unable to load/validate the event record for event ${pars.eventid}. Error: ${error2}`);
  }
  let eventPlayers;
  try {
    const pRecs = await ddbDocClient2.send(
      new QueryCommand9({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        KeyConditionExpression: "#pk = :pk and begins_with(#sk, :sk)",
        ExpressionAttributeValues: { ":pk": "ORGEVENTPLAYER", ":sk": pars.eventid },
        ExpressionAttributeNames: { "#pk": "pk", "#sk": "sk" }
      })
    );
    if (pRecs.Items === void 0 || pRecs.Items.length === 0) {
      console.log(`Error 400: No players`);
      return {
        statusCode: 400,
        body: "This event has no registered players!",
        headers
      };
    }
    eventPlayers = pRecs.Items;
  } catch (error2) {
    logGetItemError(error2);
    return formatReturnError(`eventCreateGames: Unable to load registered players for event ${pars.eventid}. Error: ${error2}`);
  }
  const idsRegistered = eventPlayers.map((p) => p.playerid);
  for (const pair of pars.pairs) {
    if (!idsRegistered.includes(pair.p1.id) || !idsRegistered.includes(pair.p2.id)) {
      console.log(`Error 400: Unregistered player`);
      return {
        statusCode: 400,
        body: `You may not create games for players not registered for this event.`,
        headers
      };
    }
  }
  const idsPaired = /* @__PURE__ */ new Set();
  for (const pair of pars.pairs) {
    idsPaired.add(pair.p1.id);
    idsPaired.add(pair.p2.id);
  }
  let players;
  try {
    players = await getPlayers([...idsPaired.values()]);
  } catch (error2) {
    logGetItemError(error2);
    return formatReturnError(`eventCreateGames: Unable to load full player records for registered players for event ${pars.eventid}. Error: ${error2}`);
  }
  try {
    const tried = /* @__PURE__ */ new Set();
    for (const pair of pars.pairs) {
      const id = [pair.metagame, ...pair.variants].join("|");
      if (tried.has(id)) {
        continue;
      } else {
        tried.add(id);
      }
      const info = gameinfo3.get(pair.metagame);
      let engine;
      if (info.playercounts.length > 1)
        engine = GameFactory7(pair.metagame, 2, pair.variants);
      else
        engine = GameFactory7(pair.metagame, void 0, pair.variants);
      if (!engine) {
        console.log(`Error 400: No engine`);
        return {
          statusCode: 400,
          body: `The game engine could not be initialized for the game ${pair.metagame} and the variants "${pair.variants.join(", ")}".`,
          headers
        };
      }
      const varsReqd = [...pair.variants];
      varsReqd.sort((a, b) => a.localeCompare(b));
      const varsEngine = [...engine.variants];
      varsEngine.sort((a, b) => a.localeCompare(b));
      if (varsReqd.join("|") !== varsEngine.join("|")) {
        console.log(`Error 400: Missing variants`);
        return {
          statusCode: 400,
          body: `The variants requested (${JSON.stringify(varsReqd)}) do not match the variants asserted by the game engine (${JSON.stringify(varsEngine)}).`,
          headers
        };
      }
    }
  } catch (error2) {
    logGetItemError(error2);
    return formatReturnError(`eventCreateGames: Unable to validate metagame/variant combos for event ${pars.eventid}. Error: ${error2}`);
  }
  const list = [];
  const createdGames = [];
  try {
    for (const pair of pars.pairs) {
      const gameId = v4_default();
      const playerIDs = [pair.p1.id, pair.p2.id];
      let whoseTurn = "0";
      const info = gameinfo3.get(pair.metagame);
      if (info.flags !== void 0 && info.flags.includes("simultaneous")) {
        whoseTurn = playerIDs.map(() => true);
      }
      let engine;
      if (info.playercounts.length > 1) {
        engine = GameFactory7(pair.metagame, 2, pair.variants);
      } else {
        engine = GameFactory7(pair.metagame, void 0, pair.variants);
      }
      const state = engine.serialize();
      const now = Date.now();
      const pInvolved = [players.find((p) => p.id === pair.p1.id), players.find((p) => p.id === pair.p2.id)];
      if (pInvolved.includes(void 0)) {
        throw new Error("Could not find one of the players! This should never happen!");
      }
      const gamePlayers = pInvolved.map((p) => {
        return { "id": p.id, "name": p.name, "time": pair.clockStart * 36e5 };
      });
      if (info.flags !== void 0 && info.flags.includes("perspective")) {
        let rot = 180;
        if (playerIDs.length > 2 && info.flags !== void 0 && info.flags.includes("rotate90")) {
          rot = -90;
        }
        for (let i = 1; i < playerIDs.length; i++) {
          gamePlayers[i].settings = { "rotate": i * rot };
        }
      }
      const addGame = sendCommandWithRetry(new PutCommand10({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Item: prepareGameStateForStorage({
          "pk": "GAME",
          "sk": pair.metagame + "#0#" + gameId,
          "id": gameId,
          "metaGame": pair.metagame,
          "numPlayers": 2,
          "rated": true,
          "players": gamePlayers,
          "clockStart": pair.clockStart,
          "clockInc": pair.clockInc,
          "clockMax": pair.clockMax,
          "clockHard": true,
          "noExplore": false,
          "state": state,
          "toMove": whoseTurn,
          "lastMoveTime": now,
          "gameStarted": now,
          "variants": engine.variants,
          "event": pars.eventid
        })
      }));
      list.push(addGame);
      const eventGame = {
        pk: "ORGEVENTGAME",
        sk: [pars.eventid, gameId].join("#"),
        metaGame: pair.metagame,
        variants: engine.variants,
        round: pair.round,
        gameid: gameId,
        player1: pair.p1.id,
        player2: pair.p2.id
      };
      list.push(
        sendCommandWithRetry(new PutCommand10({
          TableName: process.env.ABSTRACT_PLAY_TABLE,
          Item: eventGame
        }))
      );
      createdGames.push({
        id: gameId,
        metaGame: pair.metagame,
        variants: engine.variants,
        players: gamePlayers.map((p) => ({ id: p.id, name: p.name }))
      });
    }
  } catch (error2) {
    logGetItemError(error2);
    return formatReturnError(`eventCreateGames: Something went wrong generating pairings for event ${pars.eventid}. Error: ${error2}`);
  }
  try {
    await Promise.all(list);
    const createdGameSettings = await inAppSettingsMapForUserIds(
      createdGames.flatMap((game2) => game2.players.map((p) => p.id))
    );
    await Promise.all(createdGames.map((game2) => enqueueGameStartNotifications(
      ddbDocClient2,
      process.env.ABSTRACT_PLAY_TABLE,
      game2,
      createdGameSettings
    )));
    return {
      statusCode: 200,
      headers
    };
  } catch (error2) {
    logGetItemError(error2);
    throw new Error(`Something terrible happened while trying to create paired games for event ${pars.eventid}`);
  }
}
async function eventClose(userid, pars) {
  let userRec;
  try {
    const user = await ddbDocClient2.send(
      new GetCommand12({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "USER",
          "sk": userid
        }
      })
    );
    if (user.Item === void 0 || user.Item.admin !== true && user.Item.organizer !== true) {
      console.log(`Error 401`);
      return {
        statusCode: 401,
        headers
      };
    }
    userRec = user.Item;
  } catch (err) {
    logGetItemError(err);
    return formatReturnError(`eventClose: Unable to load user record to authorize ${userid}`);
  }
  let event;
  try {
    const eventRec = await ddbDocClient2.send(
      new GetCommand12({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "ORGEVENT",
          "sk": pars.eventid
        }
      })
    );
    if (eventRec.Item === void 0) {
      console.log(`Error 404`);
      return {
        statusCode: 404,
        headers
      };
    }
    event = eventRec.Item;
    if (userRec === void 0 || userRec.admin !== true && event.organizer !== userid) {
      console.log(`Error 401`);
      return {
        statusCode: 401,
        headers
      };
    }
  } catch (error2) {
    logGetItemError(error2);
    return formatReturnError(`eventClose: Unable to load/validate the event record for event ${pars.eventid}. Error: ${error2}`);
  }
  try {
    if (event.dateEnd === void 0) {
      event.dateEnd = Date.now();
    }
    event.winner = pars.winner;
    await ddbDocClient2.send(
      new PutCommand10({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Item: event
      })
    );
    return {
      statusCode: 200,
      headers
    };
  } catch (err) {
    logGetItemError(err);
    return formatReturnError(`eventClose: Unable to close event ${pars.eventid}`);
  }
}
async function eventUpdates(pars) {
  const work = [];
  work.push(
    sendCommandWithRetry(new UpdateCommand10({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: { "pk": "ORGEVENTGAME", "sk": `${pars.eventid}#${pars.gameid}` },
      ExpressionAttributeValues: { ":win": pars.winner, ":arb": false },
      UpdateExpression: "set winner = :win, arbitrated = :arb"
    }))
  );
  return Promise.all(work);
}
async function deleteGames(userId, pars) {
  try {
    const user = await ddbDocClient2.send(
      new GetCommand12({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "USER",
          "sk": userId
        }
      })
    );
    if (user.Item === void 0 || user.Item.admin !== true) {
      return {
        statusCode: 200,
        body: JSON.stringify({}),
        headers
      };
    }
  } catch (error2) {
    logGetItemError(error2);
    return formatReturnError(`Unable to get user ${userId}. Error: ${error2}`);
  }
  if (pars.cbit !== 0 && pars.cbit !== 1) {
    return formatReturnError("cbit must be 0 or 1");
  }
  const tableName2 = process.env.ABSTRACT_PLAY_TABLE;
  const preferredCbit = pars.cbit;
  const gameids = pars.gameids.split(",").map((id) => id.trim()).filter((id) => id.length > 0);
  const results = [];
  try {
    for (const gameid of gameids) {
      results.push(await adminDeleteGame(
        ddbDocClient2,
        tableName2,
        pars.metaGame,
        gameid,
        preferredCbit
      ));
    }
    const notFound = results.filter((result) => result.notFound).map((result) => result.gameId);
    return {
      statusCode: 200,
      body: JSON.stringify({
        message: notFound.length > 0 ? `Deleted ${results.length - notFound.length} game(s); not found: ${notFound.join(", ")}` : `Deleted ${results.length} game(s)`,
        results
      }),
      headers
    };
  } catch (error2) {
    logGetItemError(error2);
    return formatReturnError(`Unable to delete games ${pars.gameids}. Error: ${error2}`);
  }
}
async function reportProblem(pars) {
  console.log("Reported problem:", pars.error);
  const data = await ddbDocClient2.send(
    new QueryCommand9({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      KeyConditionExpression: "#pk = :pk",
      ExpressionAttributeValues: { ":pk": "USERS" },
      ExpressionAttributeNames: { "#pk": "pk", "#name": "name" },
      ProjectionExpression: "sk, #name, lastSeen, country, stars",
      ReturnConsumedCapacity: "INDEXES"
    })
  );
  const users = data.Items;
  const playerIDs = [];
  for (const user of users)
    if (user.name === "fritzd" || user.name === "Fritz Deelman" || user.name === "Perlk\xF6nig")
      playerIDs.push(user.sk);
  const errorAdmins = await getPlayers(playerIDs);
  const addresses = [];
  for (const admin of errorAdmins) {
    if (admin.email !== void 0 && admin.email !== null && admin.email !== "")
      addresses.push(admin.email);
  }
  const email = new SendEmailCommand({
    Destination: {
      ToAddresses: addresses
    },
    Message: {
      Body: {
        Text: {
          Charset: "UTF-8",
          Data: pars.error
        }
      },
      Subject: {
        Charset: "UTF-8",
        Data: `AbstractPlay front end error report${process.env.ABSTRACT_PLAY_TABLE?.includes("-dev") ? " (dev server)" : ""}`
      }
    },
    Source: "abstractplay@mail.abstractplay.com"
  });
  try {
    await sesClient.send(email);
  } catch (error2) {
    logGetItemError(error2);
    return formatReturnError(`Unable to send e-mail to error admins. Error: ${error2}`);
  }
  return {
    statusCode: 200,
    body: JSON.stringify({
      message: "Reported"
    }),
    headers
  };
}
async function sendPush(opts) {
  console.log(`Sending push: ${JSON.stringify(opts)}`);
  const { userId } = opts;
  let subscriptions;
  try {
    subscriptions = await queryPushSubscriptions(userId);
  } catch (err) {
    logGetItemError(err);
    return formatReturnError(`Unable to fetch push credentials for ${userId}`);
  }
  await sendPushToSubscriptions(opts, subscriptions, import_web_push2.default.sendNotification.bind(import_web_push2.default), logGetItemError);
}
async function invokePie(userid, pars) {
  if (pars.cbit !== 0) {
    return formatReturnError("cbit must be 0");
  }
  let data;
  try {
    data = await ddbDocClient2.send(
      new GetCommand12({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "GAME",
          "sk": pars.metaGame + "#0#" + pars.id
        }
      })
    );
  } catch (error2) {
    logGetItemError(error2);
    return formatReturnError(`Unable to get game ${pars.id} from table ${process.env.ABSTRACT_PLAY_TABLE}`);
  }
  if (!data.Item)
    throw new Error(`No game ${pars.id} in table ${process.env.ABSTRACT_PLAY_TABLE}`);
  try {
    const game2 = hydrateGameState(data.Item);
    console.log("got game in invokePie:");
    console.log(game2);
    if ("pieInvoked" in game2 && game2.pieInvoked === true) {
      console.log("Double pie detected! Aborting!");
      return {
        statusCode: 200,
        body: JSON.stringify(game2),
        headers
      };
    } else {
      const engine = GameFactory7(game2.metaGame, game2.state);
      if (!engine)
        throw new Error(`Unknown metaGame ${game2.metaGame}`);
      const flags = gameinfo3.get(game2.metaGame).flags;
      if (flags === void 0 || !flags.includes("pie") && !flags.includes("pie-even")) {
        throw new Error(`Metagame ${pars.metaGame} does not have the "pie" flag. Aborting.`);
      }
      const lastMoveTime = new Date(engine.stack[engine.stack.length - 1]._timestamp).getTime();
      const player = game2.players.find((p) => p.id === userid);
      if (!player)
        throw new Error(`Player ${userid} isn't playing in game ${pars.id}`);
      const timestamp = Date.now();
      const timeUsed = timestamp - lastMoveTime;
      if (player.time - timeUsed < 0)
        player.time = game2.clockInc * 36e5;
      else
        player.time = player.time - timeUsed + game2.clockInc * 36e5;
      if (player.time > game2.clockMax * 36e5)
        player.time = game2.clockMax * 36e5;
      const playerIDs = game2.players.map((p) => p.id);
      const players = await getPlayers(playerIDs);
      console.log(`Current player list: ${JSON.stringify(game2.players)}`);
      const reversed = [...game2.players].reverse();
      console.log(`Reversed: ${JSON.stringify(reversed)}`);
      game2.players = [...reversed];
      game2.pieInvoked = true;
      if (flags.includes("pie-even")) {
        try {
          engine.move("pass");
          game2.state = engine.serialize();
          game2.numMoves = engine.state().stack.length - 1;
          game2.toMove = `${engine.currplayer - 1}`;
        } catch (err) {
          logGetItemError(err);
          return formatReturnError('Error passing while invoking "pie-even"');
        }
      } else {
        const otherPlayer = game2.players.find((p) => p.id !== userid);
        otherPlayer.time = otherPlayer.time + timeUsed;
        game2.numMoves = engine.state().stack.length - 1;
      }
      const playerGame = {
        "id": game2.id,
        "metaGame": game2.metaGame,
        // reverse the list of players
        "players": [...reversed],
        "clockHard": game2.clockHard,
        "noExplore": game2.noExplore || false,
        "toMove": game2.toMove,
        "lastMoveTime": timestamp
      };
      const list = [];
      game2.lastMoveTime = timestamp;
      const updateGame = ddbDocClient2.send(new PutCommand10({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Item: prepareGameStateForStorage(game2)
      }));
      list.push(updateGame);
      console.log("Scheduled update to game");
      list.push(updateWatcherSummaries(
        ddbDocClient2,
        process.env.ABSTRACT_PLAY_TABLE,
        game2.id,
        playerGame
      ));
      const thisPlayer = players.find((p) => p.id === userid);
      list.push(submitComment("", { id: game2.id, metaGame: pars.metaGame, comment: `${thisPlayer.name} elected to switch seats. As a result, the game record for ply 1 has been retroactively changed to look as if ${thisPlayer.name} made that move.`, moveNumber: 2 }));
      list.push(sendSubmittedMoveEmails(game2, players.filter((p) => p.email), false));
      console.log("Scheduled emails");
      await Promise.all(list);
      console.log("All updates complete");
      await realPingBot(pars.metaGame, pars.id, game2);
      return {
        statusCode: 200,
        body: JSON.stringify(game2),
        headers
      };
    }
  } catch (error2) {
    logGetItemError(error2);
    return formatReturnError("Unable to process invoke pie");
  }
}
async function updateNote(userId, pars) {
  if (pars.note === void 0 || pars.note === null || pars.note.length === 0) {
    try {
      await ddbDocClient2.send(
        new DeleteCommand9({
          TableName: process.env.ABSTRACT_PLAY_TABLE,
          Key: {
            "pk": "NOTE",
            "sk": `${pars.gameId}#${userId}`
          }
        })
      );
    } catch (err) {
      logGetItemError(err);
      return formatReturnError(`Unable to updateNote (delete, actually) ${userId}`);
    }
  } else {
    const note = {
      pk: "NOTE",
      sk: `${pars.gameId}#${userId}`,
      note: pars.note
    };
    console.log(`Setting note for user ${userId}, game ${pars.gameId}.`);
    try {
      await ddbDocClient2.send(new PutCommand10({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Item: note
      }));
    } catch (err) {
      logGetItemError(err);
      return formatReturnError(`Unable to updateNote ${userId}`);
    }
  }
  return {
    statusCode: 200,
    body: "",
    headers
  };
}
async function updateCommented(userId, pars) {
  console.log(`Updating commented flag for game ${pars.id} to ${pars.commented}, cbit=${pars.cbit}, gameEnded=${pars.gameEnded}`);
  try {
    if (pars.cbit === 1 && pars.gameEnded !== void 0) {
      await ddbDocClient2.send(new UpdateCommand10({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "COMPLETEDGAMES#" + pars.metaGame,
          "sk": pars.gameEnded + "#" + pars.id
        },
        ExpressionAttributeValues: { ":c": pars.commented },
        UpdateExpression: "set commented = :c",
        ConditionExpression: "attribute_exists(pk) AND attribute_exists(sk)"
      }));
      console.log(`Successfully updated commented flag in COMPLETEDGAMES for game ${pars.id} to ${pars.commented}`);
    } else if (pars.cbit === 0) {
      await ddbDocClient2.send(new UpdateCommand10({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "GAME",
          "sk": pars.metaGame + "#0#" + pars.id
        },
        ExpressionAttributeValues: { ":c": pars.commented },
        UpdateExpression: "set commented = :c",
        ConditionExpression: "attribute_exists(pk) AND attribute_exists(sk)"
      }));
      console.log(`Successfully updated commented flag in GAME for game ${pars.id} to ${pars.commented}`);
    }
    return {
      statusCode: 200,
      body: JSON.stringify({ success: true }),
      headers
    };
  } catch (err) {
    logGetItemError(err);
    return formatReturnError(`Unable to update commented flag for game ${pars.id}: ${err}`);
  }
}
async function setLastSeen(userId, pars) {
  let user;
  try {
    const data = await ddbDocClient2.send(
      new GetCommand12({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "USER",
          "sk": userId
        }
      })
    );
    if (data.Item !== void 0) {
      user = data.Item;
    }
  } catch (err) {
    logGetItemError(err);
    return formatReturnError(`Unable to setLastSeen ${userId}`);
  }
  if (user !== void 0) {
    const tableName2 = process.env.ABSTRACT_PLAY_TABLE;
    const onCurrent = await hasCurrentGameRow(ddbDocClient2, tableName2, userId, pars.gameId);
    if (onCurrent) {
      let interval2 = 8;
      if (pars.interval !== void 0) {
        interval2 = pars.interval;
      }
      const now2 = /* @__PURE__ */ new Date();
      const then2 = /* @__PURE__ */ new Date();
      then2.setDate(now2.getDate() - interval2);
      console.log(`Setting lastSeen for ${pars.gameId} to ${then2.getTime()} (${then2.toUTCString()}). It is currently ${(/* @__PURE__ */ new Date()).toUTCString()}`);
      await upsertUserGameOverlay(
        ddbDocClient2,
        process.env.ABSTRACT_PLAY_TABLE,
        userId,
        pars.gameId,
        { seen: then2.getTime(), lastChat: then2.getTime() }
      );
      return {
        statusCode: 200,
        body: "",
        headers
      };
    }
  }
  let interval = 8;
  if (pars.interval !== void 0) {
    interval = pars.interval;
  }
  const now = /* @__PURE__ */ new Date();
  const then = /* @__PURE__ */ new Date();
  then.setDate(now.getDate() - interval);
  const watchedUpdated = await setWatchedSeen(
    ddbDocClient2,
    process.env.ABSTRACT_PLAY_TABLE,
    userId,
    pars.gameId,
    then.getTime(),
    then.getTime()
  );
  if (watchedUpdated) {
    return {
      statusCode: 200,
      body: "",
      headers
    };
  }
  return {
    statusCode: 406,
    body: "",
    headers
  };
}
async function botManageChallenges() {
  const userId = process.env.AIAI_USERID;
  try {
    console.log(`Getting USER record`);
    const userData = await ddbDocClient2.send(
      new GetCommand12({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "USER",
          "sk": userId
        }
      })
    );
    if (userData.Item === void 0) {
      throw new Error("Could not find a USER record for the AiAi bot");
    }
    const user = userData.Item;
    const games2 = await loadDashboardGames(
      ddbDocClient2,
      process.env.ABSTRACT_PLAY_TABLE,
      userId
    );
    console.log(`Fetching challenges`);
    const challengesReceivedIDs = Array.from(user?.challenges_received ?? /* @__PURE__ */ new Set());
    const data = await getChallenges(challengesReceivedIDs);
    const challengesReceived = data.map((r) => r.Item);
    console.log(`Got the following challenges:
${JSON.stringify(challengesReceived, null, 2)}`);
    for (const challenge of challengesReceived) {
      let accepted = false;
      const info = gameinfo3.get(challenge.metaGame);
      if (info?.flags.includes("aiai")) {
        accepted = true;
      }
      if (challenge.metaGame === "tumbleweed") {
        if (challenge.variants.includes("free-neutral") || challenge.variants.includes("capture-delay")) {
          accepted = false;
        }
      }
      console.log(`About to ${accepted ? "accept" : "deny"} challenge ${challenge.sk}`);
      await respondedChallenge(process.env.AIAI_USERID, { response: accepted, id: challenge.sk, standing: challenge.standing, metaGame: challenge.metaGame, comment: "Let's play!" });
    }
  } catch (err) {
    logGetItemError(err);
    return formatReturnError(`Unable to manage bot challenges: ${err}`);
  }
  try {
    console.log(`Getting USER record`);
    const userData = await ddbDocClient2.send(
      new GetCommand12({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "USER",
          "sk": userId
        }
      })
    );
    if (userData.Item === void 0) {
      throw new Error("Could not find a USER record for the AiAi bot");
    }
    const user = userData.Item;
    const games2 = await loadDashboardGames(
      ddbDocClient2,
      process.env.ABSTRACT_PLAY_TABLE,
      userId
    );
    for (const game2 of games2) {
      const info = gameinfo3.get(game2.metaGame);
      if (game2.toMove !== null && game2.toMove !== "") {
        const ids = [];
        if (info.flags.includes("simultaneous")) {
          const toMove = game2.toMove;
          if (toMove) {
            for (let i = 0; i < toMove.length; i++) {
              if (toMove[i]) {
                ids.push(game2.players[i].id);
              }
            }
          }
        } else {
          ids.push(game2.players[parseInt(game2.toMove, 10)].id);
        }
        if (ids.includes(process.env.AIAI_USERID)) {
          await realPingBot(game2.metaGame, game2.id);
        }
      }
    }
  } catch (err) {
    logGetItemError(err);
    return formatReturnError(`Unable to manage bot challenges: ${err}`);
  }
}
async function onetimeFix(userId) {
  try {
    const user = await ddbDocClient2.send(
      new GetCommand12({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "USER",
          "sk": userId
        }
      })
    );
    if (user.Item === void 0 || user.Item.admin !== true) {
      return {
        statusCode: 200,
        body: JSON.stringify({}),
        headers
      };
    }
  } catch (err) {
    logGetItemError(err);
    return formatReturnError(`Unable to onetimeFix ${userId}`);
  }
  return {
    statusCode: 200,
    body: JSON.stringify({
      deprecated: true,
      message: "onetime_fix is retired. It previously synced USER profile fields into the USERS directory index.",
      useInstead: "No replacement \u2014 run a targeted script or one-off repair if USERS directory fields are stale."
    }),
    headers
  };
}
async function fixGames(userId, pars) {
  try {
    const user = await ddbDocClient2.send(
      new GetCommand12({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "USER",
          "sk": userId
        }
      })
    );
    if (user.Item === void 0 || user.Item.admin !== true) {
      return {
        statusCode: 200,
        body: JSON.stringify({}),
        headers
      };
    }
  } catch (err) {
    logGetItemError(err);
    return formatReturnError(`Unable to fix_games ${userId}`);
  }
  return {
    statusCode: 200,
    body: JSON.stringify({
      deprecated: true,
      message: "fix_games no longer rebuilds USER.games[]. Dashboard membership is index-only (CURRENTGAMES#, USERGAME#).",
      useInstead: [
        "Verify: node bin/verify-dashboard-index.mjs --stage prod --verbose <userId>",
        "Purge USERGAME# orphans: node bin/dashboard-index-maintenance.mjs --stage prod --step purge-usergame-orphans --user-id <userId>",
        "If legacy RECENTCOMPLETED# rows reappear: node bin/dashboard-index-maintenance.mjs --stage prod --step purge-all-recent-completed"
      ],
      targetId: pars.targetId
    }),
    headers
  };
}
async function testPush(userId) {
  try {
    const user = await ddbDocClient2.send(
      new GetCommand12({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "USER",
          "sk": userId
        }
      })
    );
    if (user.Item === void 0 || user.Item.admin !== true) {
      return {
        statusCode: 200,
        body: JSON.stringify({}),
        headers
      };
    }
  } catch (err) {
    logGetItemError(err);
    return formatReturnError(`Unable to testPush ${userId}`);
  }
  await sendPush({
    userId,
    title: "Test",
    body: "Testing 1...2...3...",
    topic: "test",
    url: "/about"
  });
}
async function testAsync(userId, pars) {
  try {
    const user = await ddbDocClient2.send(
      new GetCommand12({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "USER",
          "sk": userId
        }
      })
    );
    if (user.Item === void 0 || user.Item.admin !== true) {
      return {
        statusCode: 200,
        body: JSON.stringify({}),
        headers
      };
    }
    console.log(`Calling makeWork with ${pars.N}`);
    makeWork();
    console.log("Done calling makeWork");
    return {
      statusCode: 200,
      body: JSON.stringify({ "n": pars.N }),
      headers
    };
  } catch (err) {
    logGetItemError(err);
    return formatReturnError(`Unable to test_async ${userId}`);
  }
}
async function pingBot(userId, pars) {
  try {
    const user = await ddbDocClient2.send(
      new GetCommand12({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "USER",
          "sk": userId
        }
      })
    );
    if (user.Item === void 0 || user.Item.admin !== true) {
      return {
        statusCode: 200,
        body: JSON.stringify({}),
        headers
      };
    }
  } catch (err) {
    logGetItemError(err);
    return formatReturnError(`Unable to testPush ${userId}`);
  }
  await realPingBot(pars.metaGame, pars.gameid);
  return {
    statusCode: 200,
    body: JSON.stringify({}),
    headers
  };
}
async function realPingBot(metaGame, gameid, game2) {
  if (game2 === void 0) {
    try {
      const data = await ddbDocClient2.send(
        new GetCommand12({
          TableName: process.env.ABSTRACT_PLAY_TABLE,
          Key: {
            "pk": "GAME",
            "sk": metaGame + "#0#" + gameid
          }
        })
      );
      if (!data.Item)
        throw new Error(`No game ${metaGame + "#0#" + gameid} found in table ${process.env.ABSTRACT_PLAY_TABLE}`);
      game2 = hydrateGameState(data.Item);
    } catch (error2) {
      logGetItemError(error2);
      return formatReturnError(`Unable to load game ${gameid} to make a bot move`);
    }
  }
  if (game2 === void 0) {
    throw new Error("Unable to load game object");
  }
  const engine = GameFactory7(metaGame, game2.state);
  if (!engine)
    throw new Error(`Unknown metaGame ${metaGame}`);
  const info = gameinfo3.get(metaGame);
  if (!engine.gameover) {
    const ids = [];
    if (info.flags.includes("simultaneous")) {
      for (let i = 0; i < game2.toMove.length; i++) {
        if (game2.toMove[i]) {
          ids.push(game2.players[i].id);
        }
      }
    } else {
      ids.push(game2.players[parseInt(game2.toMove, 10)].id);
    }
    if (ids.includes(process.env.AIAI_USERID)) {
      const body = {
        meta: metaGame,
        mgl: engine.aiaiMgl(),
        gameid,
        history: engine.state2aiai()
      };
      const input = {
        QueueUrl: process.env.SQS_URL,
        MessageBody: JSON.stringify(body)
      };
      const cmd = new SendMessageCommand3(input);
      await sqsClient3.send(cmd);
    }
  }
  await notifyRegisteredBotsTurn(metaGame, gameid, game2);
}
function makeWork() {
  return new Promise(function(resolve) {
    console.log("In makeWork");
    setTimeout(() => {
      console.log("End makeWork");
      resolve("resolved");
    }, 3e3);
  });
}
function Set_toJSON(key, value) {
  if (typeof value === "object" && value instanceof Set) {
    return [...value];
  }
  return value;
}
function shuffle(array) {
  let i = array.length, j;
  while (i > 1) {
    j = Math.floor(Math.random() * i);
    i--;
    const temp = array[i];
    array[i] = array[j];
    array[j] = temp;
  }
}
async function changeLanguageForPlayer(player) {
  const lng = resolvePlayerLanguage(player.language);
  if (instance.language !== lng) {
    await instance.changeLanguage(lng);
  }
}
function createSendEmailCommand(toAddress, player, subject, body) {
  console.log("toAddress", toAddress, "player", player, "body", body);
  const fullbody = instance.t("DearPlayer", { player }) + "\r\n\r\n" + body + "\r\n\r\n" + instance.t("EmailOut");
  return new SendEmailCommand({
    Destination: {
      ToAddresses: [
        toAddress
      ]
    },
    Message: {
      Body: {
        Text: {
          Charset: "UTF-8",
          Data: fullbody
        }
      },
      Subject: {
        Charset: "UTF-8",
        Data: subject
      }
    },
    Source: "abstractplay@mail.abstractplay.com"
  });
}
async function initi18n(language) {
  await instance.init({
    lng: language,
    fallbackLng: "en",
    resources: Object.fromEntries(
      Object.entries(LOCALE_RESOURCES).map(([lng, translation]) => [lng, { translation }])
    )
  });
}
function clientErrorMessage(err) {
  if (!(err instanceof Error))
    return void 0;
  if (err.name === "UserFacingError") {
    const ufe = err;
    return ufe.client || err.message;
  }
  if (err.message === "It is not your turn!") {
    return err.message;
  }
  return void 0;
}
function formatReturnError(message, err) {
  return {
    statusCode: 500,
    body: JSON.stringify({
      message: clientErrorMessage(err) ?? message
    }),
    headers
  };
}
function logGetItemError(err) {
  if (!err) {
    console.error("Encountered error object was empty");
    return;
  }
  if (!err.code) {
    if (err instanceof Error) {
      console.error(`An exception occurred, investigate and configure retry strategy. Error: ${err.message}`);
      if (err.stack) {
        console.error("Stack trace:", err.stack);
      }
    } else {
      console.error(`An exception occurred, investigate and configure retry strategy. Error: ${JSON.stringify(err)}`);
    }
    return;
  }
  handleCommonErrors(err);
}
function handleCommonErrors(err) {
  switch (err.code) {
    case "InternalServerError":
      console.error(`Internal Server Error, generally safe to retry with exponential back-off. Error: ${err.message}`);
      return;
    case "ProvisionedThroughputExceededException":
      console.error(`Request rate is too high. If you're using a custom retry strategy make sure to retry with exponential back-off. Otherwise consider reducing frequency of requests or increasing provisioned capacity for your table or secondary index. Error: ${err.message}`);
      return;
    case "ResourceNotFoundException":
      console.error(`One of the tables was not found, verify table exists before retrying. Error: ${err.message}`);
      return;
    case "ServiceUnavailable":
      console.error(`Had trouble reaching DynamoDB. generally safe to retry with exponential back-off. Error: ${err.message}`);
      return;
    case "ThrottlingException":
      console.error(`Request denied due to throttling, generally safe to retry with exponential back-off. Error: ${err.message}`);
      return;
    case "UnrecognizedClientException":
      console.error(`The request signature is incorrect most likely due to an invalid AWS access key ID or secret key, fix before retrying. Error: ${err.message}`);
      return;
    case "ValidationException":
      console.error(`The input fails to satisfy the constraints specified by DynamoDB, fix input before retrying. Error: ${err.message}`);
      return;
    case "RequestLimitExceeded":
      console.error(`Throughput exceeds the current throughput limit for your account, increase account level throughput before retrying. Error: ${err.message}`);
      return;
    default:
      console.error(`An exception occurred, investigate and configure retry strategy. Error: ${err.message}`);
      return;
  }
}
async function* queryItemsGenerator(queryInput) {
  let lastEvaluatedKey;
  do {
    const { Items, LastEvaluatedKey } = await ddbDocClient2.send(new QueryCommand9({ ...queryInput, ExclusiveStartKey: lastEvaluatedKey }));
    lastEvaluatedKey = LastEvaluatedKey;
    if (Items !== void 0) {
      yield Items;
    }
  } while (lastEvaluatedKey !== void 0);
}
async function purgeRetiredCompletedGames(userId) {
  try {
    const user = await ddbDocClient2.send(
      new GetCommand12({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "USER",
          "sk": userId
        }
      })
    );
    if (user.Item === void 0 || user.Item.admin !== true) {
      return {
        statusCode: 200,
        body: JSON.stringify({}),
        headers
      };
    }
  } catch (err) {
    logGetItemError(err);
    return formatReturnError(`Unable to purge retired completed games ${userId}`);
  }
  return {
    statusCode: 200,
    body: JSON.stringify({
      deprecated: true,
      message: "purge_retired_completed_games is retired. One-time purge complete (no retired COMPLETEDGAMES pk shapes remain).",
      useInstead: []
    }),
    headers
  };
}
async function updateMetaGameCounts(userId) {
  try {
    const user = await ddbDocClient2.send(
      new GetCommand12({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "USER",
          "sk": userId
        }
      })
    );
    if (user.Item === void 0 || user.Item.admin !== true) {
      return {
        statusCode: 200,
        body: JSON.stringify({}),
        headers
      };
    }
    const metaGames = [];
    gameinfo3.forEach((game2) => metaGames.push(game2.uid));
    const tableName2 = process.env.ABSTRACT_PLAY_TABLE;
    const currentgames = metaGames.map((game2) => ddbDocClient2.send(
      new QueryCommand9({
        TableName: tableName2,
        KeyConditionExpression: "#pk = :pk and begins_with(#sk, :sk)",
        ExpressionAttributeValues: { ":pk": "GAME", ":sk": game2 + "#0#" },
        ExpressionAttributeNames: { "#pk": "pk", "#sk": "sk" },
        ProjectionExpression: "#pk, #sk"
      })
    ));
    const completedgames = metaGames.map((game2) => ddbDocClient2.send(
      new QueryCommand9({
        TableName: tableName2,
        KeyConditionExpression: "#pk = :pk",
        ExpressionAttributeValues: { ":pk": "COMPLETEDGAMES#" + game2 },
        ExpressionAttributeNames: { "#pk": "pk", "#sk": "sk" },
        ProjectionExpression: "#pk, #sk"
      })
    ));
    const standingchallenges = metaGames.map((game2) => ddbDocClient2.send(
      new QueryCommand9({
        TableName: tableName2,
        KeyConditionExpression: "#pk = :pk",
        ExpressionAttributeValues: { ":pk": "STANDINGCHALLENGE#" + game2 },
        ExpressionAttributeNames: { "#pk": "pk", "#sk": "sk" },
        ProjectionExpression: "#pk, #sk"
      })
    ));
    let playerCountsByUid = {};
    try {
      playerCountsByUid = await loadSummaryPlayerCountsByUid();
    } catch (err) {
      console.warn("updateMetaGameCounts: batch ratings counts unavailable", err);
    }
    const work = await Promise.all([
      Promise.all(currentgames),
      Promise.all(completedgames),
      Promise.all(standingchallenges)
    ]);
    console.log("updateMetaGameCounts recount complete");
    const players = await getAllUsers();
    console.log("All players");
    console.log(JSON.stringify(players.map((p) => p.name)));
    const starCounts = /* @__PURE__ */ new Map();
    for (const p of players) {
      if (p.stars !== void 0) {
        for (const star of p.stars) {
          if (starCounts.has(star)) {
            const val = starCounts.get(star);
            starCounts.set(star, val + 1);
          } else {
            starCounts.set(star, 1);
          }
        }
      }
    }
    const shardedCounts = {};
    metaGames.forEach((game2, ind) => {
      shardedCounts[game2] = {
        currentgames: work[0][ind].Items ? work[0][ind].Items.length : 0,
        completedgames: work[1][ind].Items ? work[1][ind].Items.length : 0,
        standingchallenges: work[2][ind].Items ? work[2][ind].Items.length : 0,
        stars: starCounts.has(game2) ? starCounts.get(game2) : 0,
        ratingsCount: playerCountsByUid[game2] ?? 0
      };
    });
    console.log(shardedCounts);
    await Promise.all(metaGames.map(
      (metaGame) => ddbDocClient2.send(new PutCommand10({
        TableName: tableName2,
        Item: {
          pk: `METAGAMES#${metaGame}`,
          sk: "COUNTS",
          ...shardedCounts[metaGame]
        }
      }))
    ));
    return {
      statusCode: 200,
      body: JSON.stringify({ metaGames: metaGames.length }),
      headers
    };
  } catch (err) {
    logGetItemError(err);
    return formatReturnError(`Unable to update meta game counts ${userId}`);
  }
}
var import_web_push2, import_totp, LOCALE_RESOURCES, REGISTERED_LANGUAGES, REGION5, sesClient, sqsClient3, cognitoClient2, clnt2, marshallOptions, unmarshallOptions, translateConfig, ddbDocClient2, headers, sleep, DEFAULT_META_GAME_COUNTS, query, botQuery, authQuery, getAllUsers;
var init_abstractplay = __esm({
  "api/abstractplay.ts"() {
    init_esm_node();
    import_web_push2 = __toESM(require_src2());
    import_totp = __toESM(require_dist3());
    init_i18next();
    init_apback();
    init_apback2();
    init_apback3();
    init_apback4();
    init_apback5();
    init_apback6();
    init_apback7();
    init_wsBroadcast();
    init_commentAuth();
    init_playerGameMarks();
    init_participants();
    init_botOutbound();
    init_botSecrets();
    init_botCognito();
    init_botNames();
    init_testBot();
    init_gameState();
    init_gameProjector();
    init_adminDeleteGame();
    init_explorationMoves();
    init_soloGame();
    init_tournamentGame();
    init_dashboardGames();
    init_dashboardMaintenance();
    init_meQuery();
    init_touchUserLastSeen();
    init_dashboardGames();
    init_userGameOverlay();
    init_pushSubscriptions();
    init_playgroundSaves();
    init_summaryRatings();
    init_recommendationEvents();
    init_aboutText();
    init_aboutSaves();
    init_layoutFeedbackEvents();
    init_notifications();
    LOCALE_RESOURCES = { en: apback_default, fr: apback_default2, de: apback_default3, it: apback_default4, "es-US": apback_default5, pt: apback_default6, ta: apback_default7 };
    REGISTERED_LANGUAGES = Object.keys(LOCALE_RESOURCES);
    REGION5 = "us-east-1";
    sesClient = new SESClient({ region: REGION5 });
    sqsClient3 = new SQSClient3({ region: REGION5 });
    cognitoClient2 = new CognitoIdentityProviderClient2({ region: REGION5 });
    clnt2 = new DynamoDBClient2({ region: REGION5 });
    marshallOptions = {
      // Whether to automatically convert empty strings, blobs, and sets to `null`.
      convertEmptyValues: false,
      // false, by default.
      // Whether to remove undefined values while marshalling.
      removeUndefinedValues: true,
      // false, by default.
      // Whether to convert typeof object to map attribute.
      convertClassInstanceToMap: false
      // false, by default.
    };
    unmarshallOptions = {
      // Whether to return numbers as a string instead of converting them to native JavaScript numbers.
      wrapNumbers: false
      // false, by default.
    };
    translateConfig = { marshallOptions, unmarshallOptions };
    ddbDocClient2 = DynamoDBDocumentClient8.from(clnt2, translateConfig);
    headers = {
      "content-type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Credentials": true,
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Allow-Methods": "*"
    };
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    DEFAULT_META_GAME_COUNTS = {
      currentgames: 0,
      completedgames: 0,
      standingchallenges: 0,
      stars: 0
    };
    query = async (event) => {
      console.log(event);
      let pars;
      let query2;
      if (event.httpMethod === "POST" && event.body) {
        try {
          const bodyData = JSON.parse(event.body);
          query2 = bodyData.query;
          pars = bodyData.pars || {};
        } catch (error2) {
          return {
            statusCode: 400,
            body: JSON.stringify({
              message: "Invalid JSON in request body"
            }),
            headers
          };
        }
      } else {
        pars = event.queryStringParameters;
        query2 = pars.query;
      }
      console.log(pars);
      switch (query2) {
        case "user_names":
          return await userNames();
        case "challenge_details":
          return await challengeDetails(pars);
        case "standing_challenges":
          return await standingChallenges(pars);
        case "games":
          return await games(pars);
        case "meta_games":
          return await metaGamesDetails();
        case "get_game":
          return await game("", pars);
        case "get_public_exploration":
          return await getPublicExploration(pars);
        case "bot_move":
          return await botMove(pars);
        case "get_tournaments":
          return await getTournaments();
        case "get_old_tournaments":
          return await getOldTournaments(pars);
        case "get_tournament":
          return await getTournament(pars);
        case "archive_tournaments":
          return await archiveTournaments();
        case "get_event":
          return await eventGetEvent(pars);
        case "get_events":
          return await eventGetEvents();
        case "player_highlights":
          return await playerHighlights(pars);
        case "player_about":
          return await playerAbout(pars);
        case "representative_games":
          return await representativeGames(pars);
        case "report_problem":
          return await reportProblem(pars);
        default:
          return {
            statusCode: 500,
            body: JSON.stringify({
              message: `Unable to execute unknown open query '${pars.query}'`
            }),
            headers
          };
      }
    };
    botQuery = async (event) => {
      console.log("botQuery: ", event.body);
      console.log("botQuery claims:", {
        sub: event.cognitoPoolClaims?.sub,
        email: event.cognitoPoolClaims?.email,
        email_verified: event.cognitoPoolClaims?.email_verified
      });
      let body;
      try {
        body = parseLambdaIntegrationBody(event.body);
      } catch (error2) {
        return {
          statusCode: 400,
          body: JSON.stringify({
            message: "Invalid JSON in request body"
          }),
          headers
        };
      }
      const verb = body.verb;
      switch (verb) {
        case "move":
          return await handleMove(event.cognitoPoolClaims, body);
        default:
          return {
            statusCode: 400,
            body: JSON.stringify({
              message: `Unknown bot verb '${verb}'`
            }),
            headers
          };
      }
    };
    authQuery = async (event) => {
      console.log("authQuery: ", event.body.query);
      const query2 = event.body.query;
      const pars = event.body.pars;
      switch (query2) {
        case "me":
          return {
            statusCode: 200,
            body: JSON.stringify({
              deprecated: true,
              message: "me is retired. Use me_profile for site-wide bootstrap and me_dashboard for the /me page.",
              useInstead: ["me_profile", "me_dashboard"]
            }),
            headers
          };
        case "me_profile":
          return await meProfile(event.cognitoPoolClaims);
        case "me_dashboard":
          return await meDashboard(event.cognitoPoolClaims, pars);
        case "create_bot":
        case "createBot":
          return await createBot(event.cognitoPoolClaims, pars);
        case "update_bot":
        case "updateBot":
          return await updateBot(event.cognitoPoolClaims, pars);
        case "delete_bot":
        case "deleteBot":
          return await deleteBot(event.cognitoPoolClaims, pars);
        case "begin_bot_secret_rotation":
        case "beginBotSecretRotation":
          return await beginBotSecretRotation2(event.cognitoPoolClaims, pars);
        case "finalize_bot_secret_rotation":
        case "finalizeBotSecretRotation":
          return await finalizeBotSecretRotation2(event.cognitoPoolClaims, pars);
        case "test_bot_status":
          return await testBotStatus(event.cognitoPoolClaims);
        case "update_test_bot":
          return await updateTestBot(event.cognitoPoolClaims, pars);
        case "next_game":
          return await nextGame(event.cognitoPoolClaims.sub);
        case "my_settings":
          return await mySettings(event.cognitoPoolClaims);
        case "new_setting":
          return await newSetting(event.cognitoPoolClaims.sub, pars);
        case "new_profile":
          return await newProfile(event.cognitoPoolClaims, pars);
        case "set_push":
          return await setPush(event.cognitoPoolClaims.sub, pars);
        case "set_public_rivalries":
          return await setPublicRivalries(event.cognitoPoolClaims.sub, pars);
        case "save_push":
          return await savePush(event.cognitoPoolClaims.sub, pars);
        case "delete_push":
          return await deletePush(event.cognitoPoolClaims.sub, pars);
        case "save_tags":
          return await saveTags(event.cognitoPoolClaims.sub, pars);
        case "save_palettes":
          return await savePalettes(event.cognitoPoolClaims.sub, pars);
        case "save_customization":
          return await saveCustomization(event.cognitoPoolClaims.sub, pars);
        case "delete_customization":
          return await deleteCustomization(event.cognitoPoolClaims.sub, pars);
        case "update_standing":
          return await updateStanding(event.cognitoPoolClaims.sub, pars);
        case "block_player":
          return await block_player(event.cognitoPoolClaims.sub, pars);
        case "unblock_player":
          return await unblock_player(event.cognitoPoolClaims.sub, pars);
        case "standing_challenges":
          return await standingChallenges({ ...pars, userId: event.cognitoPoolClaims.sub });
        case "new_challenge":
          return await newChallenge(event.cognitoPoolClaims.sub, pars);
        case "challenge_revoke":
          return await revokeChallenge(event.cognitoPoolClaims.sub, pars);
        case "challenge_response":
          return await respondedChallenge(event.cognitoPoolClaims.sub, pars);
        case "start_solo_game":
          return await startSoloGame(event.cognitoPoolClaims.sub, pars);
        case "submit_move":
          return await submitMove(event.cognitoPoolClaims.sub, pars);
        case "timeloss":
          return await checkForTimeloss(event.cognitoPoolClaims.sub, pars);
        case "abandoned":
          return await checkForAbandonedGame(event.cognitoPoolClaims.sub, pars);
        case "invoke_pie":
          return await invokePie(event.cognitoPoolClaims.sub, pars);
        case "update_note":
          return await updateNote(event.cognitoPoolClaims.sub, pars);
        case "update_commented":
          return await updateCommented(event.cognitoPoolClaims.sub, pars);
        case "set_lastSeen":
          return await setLastSeen(event.cognitoPoolClaims.sub, pars);
        case "dismiss_notification":
          return await dismissNotificationAuth(event.cognitoPoolClaims.sub, pars);
        case "submit_comment":
          return await submitComment(event.cognitoPoolClaims.sub, pars);
        case "save_exploration":
          return await saveExploration(event.cognitoPoolClaims.sub, pars);
        case "get_exploration":
          return await getExploration(event.cognitoPoolClaims.sub, pars);
        case "get_private_exploration":
          return await getPrivateExploration(event.cognitoPoolClaims.sub, pars);
        case "get_game":
          return await game(event.cognitoPoolClaims.sub, pars);
        case "list_playground_saves":
          return await listPlaygroundSavesAuth(event.cognitoPoolClaims.sub);
        case "get_playground_save":
          return await getPlaygroundSaveAuth(event.cognitoPoolClaims.sub, pars);
        case "create_playground_save":
          return await createPlaygroundSaveAuth(event.cognitoPoolClaims.sub, pars);
        case "save_playground_save":
          return await savePlaygroundSaveAuth(event.cognitoPoolClaims.sub, pars);
        case "delete_playground_save":
          return await deletePlaygroundSaveAuth(event.cognitoPoolClaims.sub, pars);
        case "toggle_star":
          return await toggleStar(event.cognitoPoolClaims.sub, pars);
        case "watch_game":
          return await watchGameAuth(event.cognitoPoolClaims.sub, pars);
        case "unwatch_game":
          return await unwatchGameAuth(event.cognitoPoolClaims.sub, pars);
        case "highlight_game":
          return await highlightGameAuth(event.cognitoPoolClaims.sub, pars);
        case "unhighlight_game":
          return await unhighlightGameAuth(event.cognitoPoolClaims.sub, pars);
        case "recommend_game":
          return await recommendGameAuth(event.cognitoPoolClaims.sub, pars);
        case "unrecommend_game":
          return await unrecommendGameAuth(event.cognitoPoolClaims.sub, pars);
        case "log_recommendation_event":
          return await logRecommendationEventAuth(event.cognitoPoolClaims.sub, pars);
        case "log_layout_feedback_event":
          return await logLayoutFeedbackEventAuth(event.cognitoPoolClaims.sub, pars);
        case "set_game_state":
          return await injectState(event.cognitoPoolClaims.sub, pars);
        case "update_game_settings":
          return await updateGameSettings(event.cognitoPoolClaims.sub, pars);
        case "update_user_settings":
          return await updateUserSettings(event.cognitoPoolClaims.sub, pars);
        case "update_meta_game_counts":
          return await updateMetaGameCounts(event.cognitoPoolClaims.sub);
        case "purge_retired_completed_games":
          return await purgeRetiredCompletedGames(event.cognitoPoolClaims.sub);
        case "mark_published":
          return await markAsPublished(event.cognitoPoolClaims.sub, pars);
        case "new_tournament":
          return await newTournament(event.cognitoPoolClaims.sub, pars);
        case "join_tournament":
          return await joinTournament(event.cognitoPoolClaims.sub, pars);
        case "withdraw_tournament":
          return await withdrawTournament(event.cognitoPoolClaims.sub, pars);
        case "event_create":
          return await eventCreate(event.cognitoPoolClaims.sub, pars);
        case "event_delete":
          return await eventDelete(event.cognitoPoolClaims.sub, pars);
        case "event_publish":
          return await eventPublish(event.cognitoPoolClaims.sub, pars);
        case "event_register":
          return await eventRegister(event.cognitoPoolClaims.sub, pars);
        case "event_withdraw":
          return await eventWithdraw(event.cognitoPoolClaims.sub, pars);
        case "event_update_start":
          return await eventUpdateStart(event.cognitoPoolClaims.sub, pars);
        case "event_update_name":
          return await eventUpdateName(event.cognitoPoolClaims.sub, pars);
        case "event_update_desc":
          return await eventUpdateDesc(event.cognitoPoolClaims.sub, pars);
        case "event_update_invites":
          return await eventUpdateInvites(event.cognitoPoolClaims.sub, pars);
        case "event_update_result":
          return await eventUpdateResult(event.cognitoPoolClaims.sub, pars);
        case "event_update_divisions":
          return await eventUpdateDivisions(event.cognitoPoolClaims.sub, pars);
        case "event_create_games":
          return await eventCreateGames(event.cognitoPoolClaims.sub, pars);
        case "event_close":
          return await eventClose(event.cognitoPoolClaims.sub, pars);
        case "ping_bot":
          return await pingBot(event.cognitoPoolClaims.sub, pars);
        case "onetime_fix":
          return await onetimeFix(event.cognitoPoolClaims.sub);
        case "fix_games":
          return await fixGames(event.cognitoPoolClaims.sub, pars);
        case "test_push":
          return await testPush(event.cognitoPoolClaims.sub);
        case "test_async":
          return await testAsync(event.cognitoPoolClaims.sub, pars);
        case "delete_games":
          return await deleteGames(event.cognitoPoolClaims.sub, pars);
        case "end_tournament":
          return await endATournament(event.cognitoPoolClaims.sub, pars);
        default:
          return {
            statusCode: 500,
            body: JSON.stringify({
              message: `Unable to execute unknown query '${query2}'`
            }),
            headers
          };
      }
    };
    getAllUsers = async () => {
      const result = [];
      const queryInput = {
        KeyConditionExpression: "#pk = :pk",
        ExpressionAttributeNames: {
          "#pk": "pk"
        },
        ExpressionAttributeValues: {
          ":pk": "USER"
        },
        TableName: process.env.ABSTRACT_PLAY_TABLE
      };
      for await (const page of queryItemsGenerator(queryInput)) {
        result.push(...page);
      }
      return result;
    };
  }
});
init_abstractplay();
export {
  authQuery,
  botQuery,
  botRespondToChallenge,
  changeLanguageForPlayer,
  createSendEmailCommand,
  formatReturnError,
  handleCommonErrors,
  initi18n,
  logGetItemError,
  query
};
/*! Bundled license information:

safe-buffer/index.js:
  (*! safe-buffer. MIT License. Feross Aboukhadijeh <https://feross.org/opensource> *)

urlsafe-base64/lib/urlsafe-base64.js:
  (*!
   * urlsafe-base64
   *)
*/
