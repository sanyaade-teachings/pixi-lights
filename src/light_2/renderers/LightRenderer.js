/**
 *
 * @class
 * @private
 * @memberof PIXI.lights
 * @extends PIXI.ObjectRenderer
 * @param renderer {WebGLRenderer} The renderer this sprite batch works for.
 */
function LightRenderer(renderer)
{
    PIXI.ObjectRenderer.call(this, renderer);

    // the total number of indices in our batch, there are 6 points per quad.
    var numIndices = LightRenderer.MAX_LIGHTS * 6;

    /**
     * Holds the indices
     *
     * @member {Uint16Array}
     */
    this.indices = new Uint16Array(numIndices);

    //TODO this could be a single buffer shared amongst all renderers as we reuse this set up in most renderers
    for (var i = 0, j = 0; i < numIndices; i += 6, j += 4)
    {
        this.indices[i + 0] = j + 0;
        this.indices[i + 1] = j + 1;
        this.indices[i + 2] = j + 2;
        this.indices[i + 3] = j + 0;
        this.indices[i + 4] = j + 2;
        this.indices[i + 5] = j + 3;
    }

    /**
     * The current size of the batch, each render() call adds to this number.
     *
     * @member {number}
     */
    this.currentBatchSize = 0;

    /**
     * The current lights in the batch.
     *
     * @member {Light[]}
     */
    this.lights = [];
}

LightRenderer.MAX_LIGHTS = 500;

LightRenderer.prototype = Object.create(PIXI.ObjectRenderer.prototype);
LightRenderer.prototype.constructor = LightRenderer;
module.exports = LightRenderer;

PIXI.WebGLRenderer.registerPlugin('lights', LightRenderer);

/**
 * Renders the light object.
 *
 * @param light {Light} the light to render
 */
LightRenderer.prototype.render = function (light)
{
    this.lights[this.currentBatchSize++] = light;
};

LightRenderer.prototype.flush = function ()
{
    var renderer = this.renderer,
        gl = renderer.gl,
        diffuseTexture = renderer.diffuseTexture,
        normalsTexture = renderer.normalsTexture,
        lastShader = null;

    for (var i = 0; i < this.currentBatchSize; ++i)
    {
        var light = this.lights[i],
            shader = light.shader || this.renderer.shaderManager.plugins[light.shaderName];

        if (!light._vertexBuffer)
        {
            this._initWebGL(light);
        }

        // set shader if needed
        if (shader !== lastShader) {
            lastShader = shader;
            renderer.shaderManager.setShader(shader);
        }

        renderer.blendModeManager.setBlendMode(light.blendMode);

        // set uniforms
        light.worldTransform.toArray(true, shader.uniforms.translationMatrix.value);
        renderer.currentRenderTarget.projectionMatrix.toArray(true, shader.uniforms.projectionMatrix.value);

        shader.uniforms.alpha.value = light.worldAlpha;

        shader.uniforms.uViewSize.value[0] = renderer.width;
        shader.uniforms.uViewSize.value[1] = renderer.height;

        shader.uniforms.uAmbientColor.value[0] = renderer._lightAmbientColorRgba[0];
        shader.uniforms.uAmbientColor.value[1] = renderer._lightAmbientColorRgba[1];
        shader.uniforms.uAmbientColor.value[2] = renderer._lightAmbientColorRgba[2];
        shader.uniforms.uAmbientColor.value[3] = renderer._lightAmbientColorRgba[3];

        shader.uniforms.uLightColor.value[0] = light._colorRgba[0];
        shader.uniforms.uLightColor.value[1] = light._colorRgba[1];
        shader.uniforms.uLightColor.value[2] = light._colorRgba[2];
        shader.uniforms.uLightColor.value[3] = light._colorRgba[3];

        shader.uniforms.uLightFalloff.value[0] = light.falloff[0];
        shader.uniforms.uLightFalloff.value[1] = light.falloff[1];
        shader.uniforms.uLightFalloff.value[2] = light.falloff[2];

        shader.syncUniforms();

        // have to set these manually due to the way pixi base shader makes assumptions about texture units
        gl.uniform1i(shader.uniforms.uSampler._location, 0);
        gl.uniform1i(shader.uniforms.uNormalSampler._location, 1);

        if (!light.needsUpdate)
        {
            // update vertex data
            gl.bindBuffer(gl.ARRAY_BUFFER, light._vertexBuffer);
            gl.bufferSubData(gl.ARRAY_BUFFER, 0, light.vertices);
            gl.vertexAttribPointer(shader.attributes.aVertexPosition, 2, gl.FLOAT, false, 0, 0);

            // bind diffuse texture
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, diffuseTexture.baseTexture._glTextures[gl.id]);

            // bind normal texture
            gl.activeTexture(gl.TEXTURE1);
            gl.bindTexture(gl.TEXTURE_2D, normalsTexture.baseTexture._glTextures[gl.id]);

            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, light._indexBuffer);
            gl.bufferSubData(gl.ELEMENT_ARRAY_BUFFER, 0, light.indices);
        }
        else
        {
            light.needsUpdate = false;

            // upload vertex data
            gl.bindBuffer(gl.ARRAY_BUFFER, light._vertexBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, light.vertices, gl.STATIC_DRAW);
            gl.vertexAttribPointer(shader.attributes.aVertexPosition, 2, gl.FLOAT, false, 0, 0);

            // bind diffuse texture
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, diffuseTexture.baseTexture._glTextures[gl.id]);

            // bind normal texture
            gl.activeTexture(gl.TEXTURE1);
            gl.bindTexture(gl.TEXTURE_2D, normalsTexture.baseTexture._glTextures[gl.id]);

            // static upload of index buffer
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, light._indexBuffer);
            gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, light.indices, gl.STATIC_DRAW);
        }

        gl.drawElements(gl.TRIANGLES, light.indices.length, gl.UNSIGNED_SHORT, 0);
    }

    this.currentBatchSize = 0;
};

/**
 * Prepares all the buffers to render this light.
 *
 * @param light {Light} The light object to prepare for rendering.
 */
LightRenderer.prototype._initWebGL = function (light)
{
    var gl = this.renderer.gl;

    // create the buffers
    light._vertexBuffer = gl.createBuffer();
    light._indexBuffer = gl.createBuffer();

    gl.bindBuffer(gl.ARRAY_BUFFER, light._vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, light.vertices, gl.DYNAMIC_DRAW);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, light._indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, light.indices, gl.STATIC_DRAW);
};

LightRenderer.prototype.destroy = function ()
{
    
};
