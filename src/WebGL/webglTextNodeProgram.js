/**
 * @fileOverview Defines text nodes for webglGraphics class.
 * Shape of nodes is rectangle.
 *
 * @author  ▟ ▖▟ ▖ / https://github.com/dodo
 */

var renderAtlas = require('font-atlas');
var glUtils = require('./webgl.js');
var Texture = require('./texture.js');

module.exports = webglTextNodeProgram;

/**
 * Defines simple UI for nodes in webgl renderer. Each node is rendered as an image.
 */
function webglTextNodeProgram(options) {
  // WebGL is gian state machine, we store some properties of the state here:
  var ATTRIBUTES_PER_PRIMITIVE = 12;
  var nodesFS = createNodeFragmentShader();
  var nodesVS = createNodeVertexShader();
  var atlas = new Texture(0);
  var chars = {};
  var program;
  var gl;
  var utils;
  var locations;
  var offsets = {};
  var letters = {count:0, buffer:null, data:new Float32Array(64)};
  var glyphs = {info:null, buffer:null, data:new Float32Array(64)};
  var width;
  var height;
  var transform;
  var sizeDirty;

  atlas.version = 0;

  options = options || {};
  options.family = options.family || "Verdana";
  options.size = options.size || 10;
  options.foreground = options.foreground || "white";
  options.background = options.background || "#009ee8";
  options.canvas = atlas.canvas;

  options.size *= 10; // increase font dpi

  return {
    load: load,

    /**
     * Updates position of current node in the buffer of nodes.
     *
     * @param idx - index of current node.
     * @param pos - new position of the node.
     */
    position: position,

    createNode: createNode,

    removeNode: removeNode,

    replaceProperties: replaceProperties,

    updateTransform: updateTransform,

    updateSize: updateSize,

    render: render
  };

  function refreshTexture(texture) {
    if (texture.nativeObject) {
      gl.deleteTexture(texture.nativeObject);
    }

    var nativeObject = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, nativeObject);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, texture.canvas);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_NEAREST);

    gl.generateMipmap(gl.TEXTURE_2D);
    gl.uniform1i(locations.u_glyphs, nativeObject);

    texture.nativeObject = nativeObject;
  }

  function ensureAtlasTextureUpdated() {
    if (atlas.isDirty) {
      atlas.version++;
      options.chars = Object.keys(chars).join('');
      glyphs.info = renderAtlas(options);
      refreshTexture(atlas);
      atlas.isDirty = false;
    }
  }

  function load(glContext) {
    gl = glContext;
    utils = glUtils(glContext);

    program = utils.createProgram(nodesVS, nodesFS);
    gl.useProgram(program);
    locations = utils.getLocations(program, ["a_vertexPos", "a_glyphCoord", "u_screenSize", "u_transform", "u_glyphs"]);

    gl.enableVertexAttribArray(locations.vertexPos);
    gl.enableVertexAttribArray(locations.glyphCoord);

    letters.buffer = gl.createBuffer();
    glyphs.buffer = gl.createBuffer();
  }

  function position(nodeUI, pos) {
    ensureAtlasTextureUpdated();
    var w, h;
    if (nodeUI._version !== atlas.version) {
      var _lw = 1 / atlas.canvas.width, _lh = 1 / atlas.canvas.height;
      var new_glyphs = true;
      var h = 0, w = nodeUI.text.split('').reduce(function (sum, char) {
        h = Math.max(h, glyphs.info[char].h);
        return sum + glyphs.info[char].w;
      }, 0);
      w *= 0.25; h *= 0.5;
      nodeUI._version = atlas.version;
      nodeUI._height = h;
      nodeUI._width = w;
    } else {
      w = nodeUI._width;
      h = nodeUI._height;
    }
    var idx = offsets[nodeUI.id] * ATTRIBUTES_PER_PRIMITIVE;
    for (var i = 0, o = 0, len = nodeUI.text.length ; i < len; i++) {
      var g = glyphs.info[nodeUI.text.charAt(i)];
      var x = pos.x - w * 0.1 + o;
      var gw = g.w * 0.5 * 0.1;
      var gh = h * 0.1;

      letters.data[idx +  0] = x - gw;
      letters.data[idx +  1] = pos.y - gh;

      letters.data[idx +  2] = x + gw;
      letters.data[idx +  3] = pos.y - gh;

      letters.data[idx +  4] = x - gw;
      letters.data[idx +  5] = pos.y + gh;

      letters.data[idx +  6] = x - gw;
      letters.data[idx +  7] = pos.y + gh;

      letters.data[idx +  8] = x + gw;
      letters.data[idx +  9] = pos.y - gh;

      letters.data[idx + 10] = x + gw;
      letters.data[idx + 11] = pos.y + gh;

      if (new_glyphs) {
        var u1 =  g.x        * _lw;
        var v1 = (g.y + g.h) * _lh;
        var u2 = (g.x + g.w) * _lw;
        var v2 =  g.y        * _lh;

        glyphs.data[idx +  0] = u1;
        glyphs.data[idx +  1] = v2;

        glyphs.data[idx +  2] = u2;
        glyphs.data[idx +  3] = v2;

        glyphs.data[idx +  4] = u1;
        glyphs.data[idx +  5] = v1;

        glyphs.data[idx +  6] = u1;
        glyphs.data[idx +  7] = v1;

        glyphs.data[idx +  8] = u2;
        glyphs.data[idx +  9] = v2;

        glyphs.data[idx + 10] = u2;
        glyphs.data[idx + 11] = v1;
      }

      idx += ATTRIBUTES_PER_PRIMITIVE;
      o += gw * 2;
    }
  }

  function createNode(ui) {
    offsets[ui.id] = letters.count;
    if (ui.text) {
      ui.text.split('').forEach(function (char) {
        chars[char] = (chars[char] || 0) + 1;
      })
      atlas.isDirty = true;
      letters.count += ui.text.length;
      letters.data = utils.extendArray(letters.data, letters.count, ATTRIBUTES_PER_PRIMITIVE);
      glyphs.data = utils.extendArray(glyphs.data, letters.count, ATTRIBUTES_PER_PRIMITIVE);
    }
  }

  function removeNode(nodeUI) {
    delete offsets[nodeUI.id];
    if (nodeUI.text) {
      letters.count -= nodeUI.text.length;
      nodeUI.text.split('').forEach(function (char) {
        chars[char]--;
        if (!chars[char]) {
          atlas.isDirty = true;
          delete chars[char];
        }
      });
      if (letters.count < 0) letters.count = 0;
      utils.copyArrayPart(letters.data, nodeUI.id * ATTRIBUTES_PER_PRIMITIVE, letters.count * ATTRIBUTES_PER_PRIMITIVE, ATTRIBUTES_PER_PRIMITIVE);
      utils.copyArrayPart(glyphs.data, nodeUI.id * ATTRIBUTES_PER_PRIMITIVE, letters.count * ATTRIBUTES_PER_PRIMITIVE, ATTRIBUTES_PER_PRIMITIVE);
    }
  }

  function replaceProperties(replacedNode, newNode) {
    var diff = newNode.text.length - replacedNode.text.length;
    var nodeCount = Object.keys(offsets).length;
    for (var i = newNode.id ; i < nodeCount ; i++ ) {
      if (offsets[i]) offsets[i] += diff;
    }
  }

  function updateTransform(newTransform) {
    sizeDirty = true;
    transform = newTransform;
  }

  function updateSize(w, h) {
    width = w;
    height = h;
    sizeDirty = true;
  }

  function render() {
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, letters.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, letters.data, gl.DYNAMIC_DRAW);
    gl.vertexAttribPointer(locations.vertexPos, 2, gl.FLOAT, false,  0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, glyphs.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, glyphs.data, gl.DYNAMIC_DRAW);
    gl.vertexAttribPointer(locations.glyphCoord, 2, gl.FLOAT, false,  0, 0);

    if (sizeDirty) {
      sizeDirty = false;
      gl.uniformMatrix4fv(locations.transform, false, transform);
      gl.uniform2f(locations.screenSize, width, height);
    }

    gl.drawArrays(gl.TRIANGLES, 0, letters.count * 6);
  }
}

// TODO: Use glslify for shaders
function createNodeFragmentShader() {
  return [
    "precision mediump float;",

    "varying vec4 color;",
    "varying vec2 vGlyphCoord;",
    "uniform sampler2D u_glyphs;",

    "void main(void) {",
    "  gl_FragColor = texture2D(u_glyphs, vGlyphCoord);",
    "}"
  ].join("\n");
}

function createNodeVertexShader() {
  return [
    "attribute vec2 a_vertexPos;",
    "attribute vec2 a_glyphCoord;",

    "uniform vec2 u_screenSize;",
    "uniform mat4 u_transform;",
    "varying vec2 vGlyphCoord;",

    "void main(void) {",
    "  gl_Position = u_transform * vec4(a_vertexPos / u_screenSize * vec2(1.,-1.), 0, 1);",
    // pass the glyph coords to the fragment shader.
    "  vGlyphCoord = a_glyphCoord;",
    "}"
  ].join("\n");
}

