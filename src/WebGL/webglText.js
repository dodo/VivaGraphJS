
module.exports = webglText;

/**
 * Can be used as a callback in the webglGraphics.node() function, to
 * create a custom looking node.
 *
 * @param text - text of the node.
 * @param size - size of the node in pixels.
 */
function webglText(text, size) {
  return {
    /**
     * Gets or sets font size.
     */
    size: typeof size === 'number' ? size : 10,

    /**
     * Gets or sets text of the node.
     */
    text: text.data
  };
}

