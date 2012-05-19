/**
 * @fileOverview Defines a naive form of nodes for webglGraphics class. 
 * This form allows to change color of node. Shape of nodes is rectangular. 
 *
 * @author Andrei Kashcha (aka anvaka) / http://anvaka.blogspot.com
 */

/*global Viva Float32Array*/


Viva.Graph.View.WebglUtils = function() {};

/**
 * Parses various color strings and returns color value used in webgl shaders.
 */

Viva.Graph.View.WebglUtils.prototype.parseColor = function(color) {
        var parsedColor = 0x009ee8;
        
        if (typeof color === 'string' && color) {
            if (color.length === 4) { // #rgb
                color = color.replace(/([^#])/g, '$1$1'); // duplicate each letter except first #.
            }
            if (color.length === 9 || color.length === 7) { // #rrggbbaa or #rrggbb. Always ignore alpha:
                parsedColor = parseInt(color.substring(1, 7), 16);
            } else {
                throw 'Color expected in hex format with preceding "#". E.g. #00ff00. Got value: ' + color;
            }
        } 
        
        return parsedColor;
    };


/**
 * Defines simple UI for nodes in webgl renderer. Each node is rendered as square. Color and size can be changed.
 */
Viva.Graph.View.webglNodeShader = function() {
   var ATTRIBUTES_PER_PRIMITIVE = 4, // Primitive is point, x, y - its coordinates + color and size == 4 attributes per node. 
         nodesFS = [
        'precision mediump float;',
        'varying vec4 color;',
        
        'void main(void) {',
        '   gl_FragColor = color;',
        '}'].join('\n'),
        nodesVS = [
        'attribute vec2 aVertexPos;',
        // Pack clor and size into vector. First elemnt is color, second - size.
        // note: since it's floatin point we can only use 24 bit to pack colors...
        // thus alpha channel is dropped, and is always assumed to be 1.
        'attribute vec2 aCustomAttributes;', 
        'uniform vec2 uScreenSize;',
        'uniform mat4 uTransform;',
        'varying vec4 color;',
        
        'void main(void) {',
        '   gl_Position = uTransform * vec4(aVertexPos/uScreenSize, 0, 1);',
        '   gl_PointSize = aCustomAttributes[1] * uTransform[0][0];',
        '   float c = aCustomAttributes[0];',
        '   color = vec4(0.0, 0.0, 0.0, 255.0);',
        '   color.b = mod(c, 256.0); c = floor(c/256.0);',
        '   color.g = mod(c, 256.0); c = floor(c/256.0);',
        '   color.r = mod(c, 256.0); c = floor(c/256.0); color /= 255.0;',
        '}'].join('\n'),
        
        utils = new Viva.Graph.View.WebglUtils();
        
        return {
            /**
             * Returns fragment shader text which renders this node.
             */
            fragmentShader : nodesFS,
            
            /**
             * Returns vertex shader text which renders this node.
             */
            vertexShader : nodesVS,
            
            /**
             * Returns number of attributes current shader reserves for webgl primtive
             * (point, line, triangle and strips)
             */
            attributesPerPrimitive : ATTRIBUTES_PER_PRIMITIVE,
            
            /**
             * Called by webglGraphics to let shader initialize its custom attributes.
             */
            initCustomAttributes : function(gl, program) {
                program.customAttributes = gl.getAttribLocation(program, 'aCustomAttributes');
            },
            
            /**
             * Called by webglGraphics to let this shader render its custom attributes.
             */
            renderCustomAttributes : function(gl, program) {
                gl.enableVertexAttribArray(program.customAttributes);
                gl.vertexAttribPointer(program.customAttributes, 2, gl.FLOAT, false, ATTRIBUTES_PER_PRIMITIVE * 4, 2 * 4);
            },
            
            /**
             * Updates position of current node in the buffer of nodes. 
             * 
             * @param nodes - buffer where all nodes are stored.
             * @param idx - index of current node.
             * @param pos - new position of the node.
             */
            position : function(nodes, nodeUI, pos) {
                var idx = nodeUI.id;
                nodes[idx * ATTRIBUTES_PER_PRIMITIVE] = pos.x;
                nodes[idx * ATTRIBUTES_PER_PRIMITIVE + 1] = pos.y;
                nodes[idx * ATTRIBUTES_PER_PRIMITIVE + 2] = nodeUI.color;
                nodes[idx * ATTRIBUTES_PER_PRIMITIVE + 3] = nodeUI.size;
            },
            
            /**
             * Can be used as a callback in the webglGraphics.node() function, to 
             * create custom looking node.
             * 
             * @param size - size of the node in pixels.
             * @param color - color of the node in '#rrggbb' or '#rgb' format. 
             *  You can also pass '#rrggbbaa', but alpha chanel is always ignored in this shader. 
             */
            square : function(size, color) {
                return {
                    size : typeof size === 'number' ? size : 10,
                    color : utils.parseColor(color)
                };
            }
        };
};

/**
 * Defines UI for links in webgl renderer. 
 */
Viva.Graph.View.webglLinkShader = function() {
     var ATTRIBUTES_PER_PRIMITIVE = 6, // primitive is Line with two points. Each has x,y and color = 3 * 2 attributes.
        linksFS = [
        'precision mediump float;',
        'varying vec4 color;',
        'void main(void) {',
        '   gl_FragColor = color;',
        '}'].join('\n'),
        
        linksVS = [
        'attribute vec2 aVertexPos;',
        'attribute float aColor;', 
        
        'uniform vec2 uScreenSize;',
        'uniform mat4 uTransform;',
        
        'varying vec4 color;',
        
        'void main(void) {',
        '   gl_Position = uTransform * vec4(aVertexPos/uScreenSize, 0.0, 1.0);',
        '   color = vec4(0.0, 0.0, 0.0, 255.0);',
        '   float c = aColor;',
        '   color.b = mod(c, 256.0); c = floor(c/256.0);',
        '   color.g = mod(c, 256.0); c = floor(c/256.0);',
        '   color.r = mod(c, 256.0); c = floor(c/256.0); color /= 255.0;',
        '}'].join('\n'),
        
        utils = new Viva.Graph.View.WebglUtils();
        
        return {
            fragmentShader : linksFS,
            vertexShader : linksVS,

            /**
             * Returns number of attributes current shader reserves for webgl primtive
             * (point, line, triangle and strips)
             */
            attributesPerPrimitive : ATTRIBUTES_PER_PRIMITIVE,
            
            /**
             * Called by webglGraphics to let shader initialize its custom attributes.
             */
            initCustomAttributes : function(gl, program) {
                program.colorAttribute = gl.getAttribLocation(program, 'aColor');
                console.log(program.colorAttribute);
            },
            
            /**
             * Called by webglGraphics to let this shader render its custom attributes.
             */
            renderCustomAttributes : function(gl, program) { 
                gl.enableVertexAttribArray(program.colorAttribute);
                gl.vertexAttribPointer(program.colorAttribute, 1, gl.FLOAT, false, 3 * 4, 2 * 4);
            },
            
            position: function(links, linkUi, fromPos, toPos) {
                var linkIdx = linkUi.id,
                    offset = linkIdx * ATTRIBUTES_PER_PRIMITIVE; 
                links[offset + 0] = fromPos.x;
                links[offset + 1] = fromPos.y;
                links[offset + 2] = linkUi.color;
                
                links[offset + 3] = toPos.x;
                links[offset + 4] = toPos.y;
                links[offset + 5] = linkUi.color;
            },
            
            line : function(color) {
                return {
                    color : utils.parseColor(color) 
                };
            }
        };
};