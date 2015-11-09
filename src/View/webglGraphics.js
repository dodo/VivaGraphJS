/**
 * @fileOverview Defines a graph renderer that uses WebGL based drawings.
 *
 * @author Andrei Kashcha (aka anvaka) / https://github.com/anvaka
 */

module.exports = webglGraphics;

var webglInputManager = require('../Input/webglInputManager.js');
var webglLinkProgram = require('../WebGL/webglLinkProgram.js');
var webglNodeProgram = require('../WebGL/webglNodeProgram.js');
var webglSquare = require('../WebGL/webglSquare.js');
var webglLine = require('../WebGL/webglLine.js');
var eventify = require('ngraph.events');
var merge = require('ngraph.merge');

/**
 * Performs webgl-based graph rendering. This module does not perform
 * layout, but only visualizes nodes and edges of the graph.
 *
 * @param options - to customize graphics  behavior. Currently supported parameter
 *  enableBlending - true by default, allows to use transparency in node/links colors.
 *  preserveDrawingBuffer - false by default, tells webgl to preserve drawing buffer.
 *                    See https://www.khronos.org/registry/webgl/specs/1.0/#5.2
 */

function webglGraphics(options) {
    options = merge(options, {
        enableBlending : true,
        preserveDrawingBuffer : false,
        clearColor: false,
        clearColorValue : {
            r : 1,
            g : 1,
            b : 1,
            a : 1
        }
    });

    var container,
        graphicsRoot,
        gl,
        width,
        height,
        nodesCount = 0,
        linksCount = 0,
        transform = [
            1, 0, 0, 0,
            0, 1, 0, 0,
            0, 0, 1, 0,
            0, 0, 0, 1
        ],
        userPlaceNodeCallback,
        userPlaceLinkCallback,
        nodes = [],
        links = [],
        initCallback,

        allNodes = {},
        allLinks = {},
        linkProgram = webglLinkProgram(),
        nodeProgram = webglNodeProgram(),
/*jshint unused: false */
        nodeUIBuilder = function (node) {
            return webglSquare(); // Just make a square, using provided gl context (a nodeProgram);
        },

        linkUIBuilder = function (link) {
            return webglLine(0xb3b3b3ff);
        },

        /** Log the weird WebGL column based transform array as a conventional transform matrix */
        logTransform = function() {
          var ret = '\n';
          for (var i = 0; i < 4; i++) {
            ret += transform[0 + i] + '\t' + transform[4 + i] + '\t' + transform[8 + i] + '\t' + transform[12 + i] + '\n';
          }
          console.log(ret);
        },
/*jshint unused: true */
        updateTransformUniform = function () {
            linkProgram.updateTransform(transform);
            nodeProgram.updateTransform(transform);
        },

        resetScaleInternal = function () {
            transform = [1, 0, 0, 0,
                        0, 1, 0, 0,
                        0, 0, 1, 0,
                        0, 0, 0, 1];
        },

        updateSize = function () {
            if (container && graphicsRoot) {
                width = graphicsRoot.width = Math.max(container.offsetWidth, 1);
                height = graphicsRoot.height = Math.max(container.offsetHeight, 1);
                if (gl) { gl.viewport(0, 0, width, height); }
                if (linkProgram) { linkProgram.updateSize(width / 2, height / 2); }
                if (nodeProgram) { nodeProgram.updateSize(width / 2, height / 2); }
            }
        },

        fireRescaled = function (graphics) {
            graphics.fire("rescaled");
        };

    graphicsRoot = window.document.createElement("canvas");

    var graphics = {
        getLinkUI: function (linkId) {
            return allLinks[linkId];
        },

        getNodeUI: function (nodeId) {
            return allNodes[nodeId];
        },

        /**
         * Sets the callback that creates node representation.
         *
         * @param builderCallback a callback function that accepts graph node
         * as a parameter and must return an element representing this node.
         *
         * @returns If builderCallbackOrNode is a valid callback function, instance of this is returned;
         * Otherwise undefined value is returned
         */
        node : function (builderCallback) {
            if (typeof builderCallback !== "function") {
                return; // todo: throw? This is not compatible with old versions
            }

            nodeUIBuilder = builderCallback;

            return this;
        },

        /**
         * Sets the callback that creates link representation
         *
         * @param builderCallback a callback function that accepts graph link
         * as a parameter and must return an element representing this link.
         *
         * @returns If builderCallback is a valid callback function, instance of this is returned;
         * Otherwise undefined value is returned.
         */
        link : function (builderCallback) {
            if (typeof builderCallback !== "function") {
                return; // todo: throw? This is not compatible with old versions
            }

            linkUIBuilder = builderCallback;
            return this;
        },


        /**
         * Allows to override default position setter for the node with a new
         * function. newPlaceCallback(nodeUI, position) is function which
         * is used by updateNodePosition().
         */
        placeNode : function (newPlaceCallback) {
            userPlaceNodeCallback = newPlaceCallback;
            return this;
        },

        placeLink : function (newPlaceLinkCallback) {
            userPlaceLinkCallback = newPlaceLinkCallback;
            return this;
        },

        /**
         * Custom input manager listens to mouse events to process nodes drag-n-drop inside WebGL canvas
         */
        inputManager : webglInputManager,

        /**
         * Called every time before renderer starts rendering.
         */
        beginRender : function () {
            // this function could be replaced by this.init,
            // based on user options.
        },

        /**
         * Called every time when renderer finishes one step of rendering.
         */
        endRender : function () {
            if (linksCount > 0) {
                linkProgram.render();
            }
            if (nodesCount > 0) {
                nodeProgram.render();
            }
        },

        bringLinkToFront : function (linkUI) {
            var frontLinkId = linkProgram.getFrontLinkId(),
                srcLinkId,
                temp;

            linkProgram.bringToFront(linkUI);

            if (frontLinkId > linkUI.id) {
                srcLinkId = linkUI.id;

                temp = links[frontLinkId];
                links[frontLinkId] = links[srcLinkId];
                links[frontLinkId].id = frontLinkId;
                links[srcLinkId] = temp;
                links[srcLinkId].id = srcLinkId;
            }
        },

        /**
         * Sets translate operation that should be applied to all nodes and links.
         */
        graphCenterChanged : function (x, y) {
            transform[12] = (2 * x / width) - 1;
            transform[13] = 1 - (2 * y / height);
            updateTransformUniform();
        },

        /**
         * Called by Viva.Graph.View.renderer to let concrete graphic output
         * provider prepare to render given link of the graph
         *
         * @param link - model of a link
         */
        addLink: function (link, boundPosition) {
            var uiid = linksCount++,
                ui = linkUIBuilder(link);
            ui.id = uiid;
            ui.pos = boundPosition;

            linkProgram.createLink(ui);

            links[uiid] = ui;
            allLinks[link.id] = ui;
            return ui;
        },

       /**
        * Called by Viva.Graph.View.renderer to let concrete graphic output
        * provider prepare to render given node of the graph.
        *
        * @param nodeUI visual representation of the node created by node() execution.
        **/
        addNode : function (node, boundPosition) {
            var uiid = nodesCount++,
                ui = nodeUIBuilder(node);

            ui.id = uiid;
            ui.position = boundPosition;
            ui.node = node;

            nodeProgram.createNode(ui);

            nodes[uiid] = ui;
            allNodes[node.id] = ui;
            return ui;
        },

        translateRel : function (dx, dy) {
            transform[12] += (2 * transform[0] * dx / width) / transform[0];
            transform[13] -= (2 * transform[5] * dy / height) / transform[5];
            updateTransformUniform();
        },

        /**
         * Return the center of the graph in clip space coordinates
         * Can be passed in as-is to setCenter()
         * */
        getCenter: function () {
            return {x: transform[12], y: transform[13]};
        },

        /**
         * Set the center of the graph in clip space coordinates
         *
         * @param center the new center of the graph in clip space coordinates
         * */
        setCenter: function (center) {
            // We only have linear transforms on the X and Y axes
            transform[12] = center.x;
            transform[13] = center.y;
            updateTransformUniform();
        },

        /**
         * Maintain the center of the viewport through a resize
         * Note: the SVG and WebGL canvases are resized differently which is why this is graphics dependant
         *
         * @param currentCenter the center of the graph prior resize
         * @param newSize the size of the container post resize
         * @param previousSize the size of the container prior resize
         * */
        preserveCenter: function(currentCenter, newSize, previousSize) {
            var newCenterX = currentCenter.x * (previousSize.width / newSize.width);
            var newCenterY = currentCenter.y * (previousSize.height / newSize.height);
            this.setCenter({x: newCenterX, y: newCenterY});
        },

        /**
         * Set the absolute scale (i.e. zoom level)
         *
         * @param scale the new absolute scale
         * */
        setScale: function (scale) {
            // We only have linear transforms on the X and Y axes
            transform[0] = scale;
            transform[5] = scale;
            updateTransformUniform();
            fireRescaled(this);
        },

        /**
         * Multiply the current scale by scaleFactor, optionally moving to scrollPoint before applying the scale
         * This is used by scroll-to-zoom to give a map-like zoom behaviour
         * If called with no arguments, return the current scale
         *
         * @param scaleFactor the scale multiplier
         * @param scrollPoint the point in DOM coordinates from which the scale is applied
         * */
        scale : function (scaleFactor, scrollPoint) {
            // If no scaleFactor is passed in return the current scale
            if (!scaleFactor) { // falsie check is ok because 0 would be an invalid scale
                return transform[0];
            }

            if (scrollPoint) {
              this.setCenter(this.getScaleScrollPointCenter(scaleFactor, scrollPoint));
            }

            transform[0] *= scaleFactor;
            transform[5] *= scaleFactor;

            updateTransformUniform();
            fireRescaled(this);

            return transform[0];
        },

        getScaleScrollPointCenter : function(scaleFactor, scrollPoint) {
          var currentCenter = this.getCenter();

          // Transform scroll point to clip-space coordinates:
          var cx = 2 * scrollPoint.x / width - 1,
              cy = 1 - (2 * scrollPoint.y) / height;

          cx -= currentCenter.x;
          cy -= currentCenter.y;

          return {
            x: currentCenter.x + cx * (1 - scaleFactor),
            y: currentCenter.y + cy * (1 - scaleFactor)
          };
        },

        getGraphCenter: function(containerSize, graphRect) {
          var scale = this.scale();
          return {
            x: -scale * (graphRect.x1 + graphRect.x2) / containerSize.width,
            y: scale * (graphRect.y1 + graphRect.y2) / containerSize.height
          };
        },

        resetScale : function () {
            resetScaleInternal();

            if (gl) {
                updateSize();
                // TODO: what is this?
                // gl.useProgram(linksProgram);
                // gl.uniform2f(linksProgram.screenSize, width, height);
                updateTransformUniform();
            }
            return this;
        },

       /**
        * Called by Viva.Graph.View.renderer to let concrete graphic output
        * provider prepare to render.
        */
        init : function (c) {
            var contextParameters = {};

            if (options.preserveDrawingBuffer) {
                contextParameters.preserveDrawingBuffer = true;
            }

            container = c;

            updateSize();
            resetScaleInternal();
            container.appendChild(graphicsRoot);


            gl = graphicsRoot.getContext("experimental-webgl", contextParameters);
            if (!gl) {
                var msg = "Could not initialize WebGL. Seems like the browser doesn't support it.";
                window.alert(msg);
                throw msg;
            }
            if (options.enableBlending) {
                gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
                gl.enable(gl.BLEND);
            }
            if (options.clearColor) {
                var color = options.clearColorValue;
                gl.clearColor(color.r, color.g, color.b, color.a);
                // TODO: not the best way, really. Should come up with something better
                // what if we need more updates inside beginRender, like depth buffer?
                this.beginRender = function () {
                    gl.clear(gl.COLOR_BUFFER_BIT);
                };
            }

            linkProgram.load(gl);
            linkProgram.updateSize(width / 2, height / 2);

            nodeProgram.load(gl);
            nodeProgram.updateSize(width / 2, height / 2);

            updateTransformUniform();

            // Notify the world if someone waited for update. TODO: should send an event
            if (typeof initCallback === "function") {
                initCallback(graphicsRoot);
            }
        },

        /**
        * Called by Viva.Graph.View.renderer to let concrete graphic output
        * provider release occupied resources.
        */
        release : function (container) {
            if (graphicsRoot && container) {
                container.removeChild(graphicsRoot);
                // TODO: anything else?
            }
        },

       /**
        * Checks whether webgl is supported by this browser.
        */
        isSupported : function () {
            var c = window.document.createElement("canvas"),
                gl = c && c.getContext && c.getContext("experimental-webgl");
            return gl;
        },

       /**
        * Called by Viva.Graph.View.renderer to let concrete graphic output
        * provider remove link from rendering surface.
        *
        * @param linkUI visual representation of the link created by link() execution.
        **/
        releaseLink : function (link) {
            if (linksCount > 0) { linksCount -= 1; }
            var linkUI = allLinks[link.id];
            delete allLinks[link.id];

            linkProgram.removeLink(linkUI);

            var linkIdToRemove = linkUI.id;
            if (linkIdToRemove < linksCount) {
                if (linksCount === 0 || linksCount === linkIdToRemove) {
                    return; // no more links or removed link is the last one.
                }

                var lastLinkUI = links[linksCount];
                links[linkIdToRemove] = lastLinkUI;
                lastLinkUI.id = linkIdToRemove;
            }
        },

       /**
        * Called by Viva.Graph.View.renderer to let concrete graphic output
        * provider remove node from rendering surface.
        *
        * @param nodeUI visual representation of the node created by node() execution.
        **/
        releaseNode : function (node) {
            if (nodesCount > 0) { nodesCount -= 1; }
            var nodeUI = allNodes[node.id];
            delete allNodes[node.id];

            nodeProgram.removeNode(nodeUI);

            var nodeIdToRemove = nodeUI.id;
            if (nodeIdToRemove < nodesCount) {
                if (nodesCount === 0 || nodesCount === nodeIdToRemove) {
                    return; // no more nodes or removed node is the last in the list.
                }

                var lastNodeUI = nodes[nodesCount];

                nodes[nodeIdToRemove] = lastNodeUI;
                lastNodeUI.id = nodeIdToRemove;

                // Since concrete shaders may cache properties in the UI element
                // we are letting them to make this swap (e.g. image node shader
                // uses this approach to update node's offset in the atlas)
                nodeProgram.replaceProperties(nodeUI, lastNodeUI);
            }
        },

        renderNodes: function () {
            var pos = {x : 0, y : 0};
            // WebGL coordinate system is different. Would be better
            // to have this transform in the shader code, but it would
            // require every shader to be updated..
            for (var i = 0; i < nodesCount; ++i) {
                var ui = nodes[i];
                pos.x = ui.position.x;
                pos.y = ui.position.y;
                if (userPlaceNodeCallback) {
                    userPlaceNodeCallback(ui, pos);
                }

                nodeProgram.position(ui, pos);
            }
        },

        renderLinks: function () {
            if (this.omitLinksRendering) { return; }

            var toPos = {x : 0, y : 0};
            var fromPos = {x : 0, y : 0};
            for (var i = 0; i < linksCount; ++i) {
                var ui = links[i];
                var pos = ui.pos.from;
                fromPos.x = pos.x;
                fromPos.y = -pos.y;
                pos = ui.pos.to;
                toPos.x = pos.x;
                toPos.y = -pos.y;
                if (userPlaceLinkCallback) {
                    userPlaceLinkCallback(ui, fromPos, toPos);
                }

                linkProgram.position(ui, fromPos, toPos);
            }
        },

        /**
         * Returns root element which hosts graphics.
         */
        getGraphicsRoot : function (callbackWhenReady) {
            // todo: should fire an event, instead of having this context.
            if (typeof callbackWhenReady === "function") {
                if (graphicsRoot) {
                    callbackWhenReady(graphicsRoot);
                } else {
                    initCallback = callbackWhenReady;
                }
            }
            return graphicsRoot;
        },

        /**
         * Updates default shader which renders nodes
         *
         * @param newProgram to use for nodes.
         */
        setNodeProgram : function (newProgram) {
            if (!gl && newProgram) {
                // Nothing created yet. Just set shader to the new one
                // and let initialization logic take care about the rest.
                nodeProgram = newProgram;
            } else if (newProgram) {
                throw "Not implemented. Cannot swap shader on the fly... Yet.";
                // TODO: unload old shader and reinit.
            }
        },

        /**
         * Updates default shader which renders links
         *
         * @param newProgram to use for links.
         */
        setLinkProgram : function (newProgram) {
            if (!gl && newProgram) {
                // Nothing created yet. Just set shader to the new one
                // and let initialization logic take care about the rest.
                linkProgram = newProgram;
            } else if (newProgram) {
                throw "Not implemented. Cannot swap shader on the fly... Yet.";
                // TODO: unload old shader and reinit.
            }
        },

        /**
         * Transforms client coordinates into layout coordinates. Client coordinates
         * are DOM coordinates relative to the rendering container. Layout
         * coordinates are those assigned by by layout algorithm to each node.
         *
         * @param {Object} p - a point object with `x` and `y` attributes.
         * This method mutates p.
         */
        transformClientToGraphCoordinates: function (p) {
          // TODO: could be a problem when container has margins?
            // normalize
            p.x = ((2 * p.x) / width) - 1;
            p.y = 1 - ((2 * p.y) / height);

            // apply transform
            p.x = (p.x - transform[12]) / transform[0];
            p.y = (p.y - transform[13]) / transform[5];

            // transform to graph coordinates
            p.x = p.x * (width / 2);
            p.y = p.y * (-height / 2);

            return p;
        },

        /**
         * Transforms WebGL coordinates into client coordinates. Reverse of 
         * `transformClientToGraphCoordinates()`
         *
         * @param {Object} p - a point object with `x` and `y` attributes, which
         * represents a layout coordinate. This method mutates p.
         */
        transformGraphToClientCoordinates: function (p) {
          // TODO: could be a problem when container has margins?
            // transform from graph coordinates
            p.x = p.x / (width / 2);
            p.y = p.y / (-height / 2);

            // apply transform
            p.x = (p.x * transform[0]) + transform[12];
            p.y = (p.y * transform[5]) + transform[13];

            // denormalize
            p.x = ((p.x + 1) * width) / 2;
            p.y = ((1 - p.y) * height) / 2;

            return p;
        },

        getNodeAtClientPos: function (clientPos, preciseCheck) {
            if (typeof preciseCheck !== "function") {
                // we don't know anything about your node structure here :(
                // potentially this could be delegated to node program, but for
                // right now, we are giving up if you don't pass boundary check
                // callback. It answers to a question is nodeUI covers  (x, y)
                return null;
            }
            // first transform to graph coordinates:
            this.transformClientToGraphCoordinates(clientPos);
            // now using precise check iterate over each node and find one within box:
            // TODO: This is poor O(N) performance.
            for (var i = 0; i < nodesCount; ++i) {
                if (preciseCheck(nodes[i], clientPos.x, clientPos.y)) {
                    return nodes[i].node;
                }
            }
            return null;
        }
    };

    // Let graphics fire events before we return it to the caller.
    eventify(graphics);

    return graphics;
}
