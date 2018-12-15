(function () {
    var now;
    if (performance && performance.now) {
        now = function () {
            return performance.now();
        };
    } else {
        now = function () {
            return new Date().getTime();
        };
    }

    function getSetters(gl, prog, obj, pfx, depth) {
        if (!obj) return;
        depth = (depth + 1) || 0;
        if (depth > 10) {
            console.error('Nesting limit exceeded: ' + pfx);
            return;
        }

        pfx = pfx || '';

        function getSetter(gl, path, val) {

            let loc = gl.getUniformLocation(prog, path);

            if (!isNaN(val))
                return (function (gl, loc) {
                    return function (val) {
                        gl.uniform1f(loc, val);
                    }
                })(gl, loc);

            switch (val.length) {
                case 1:
                    return (function (gl, loc) {
                        return function (val) {
                            gl.uniform1f(loc, val[0]);
                        }
                    })(gl, loc);
                case 2:
                    return (function (gl, loc) {
                        return function (val) {
                            gl.uniform2f(loc, val[0], val[1]);
                        }
                    })(gl, loc);
                case 3:
                    return (function (gl, loc) {
                        return function (val) {
                            gl.uniform3f(loc, val[0], val[1], val[2]);
                        }
                    })(gl, loc);
                case 4:
                    return (function (gl, loc) {
                        return function (val) {
                            gl.uniform4f(loc, val[0], val[1], val[2], val[3]);
                        }
                    })(gl, loc);

                    //gl.uniformMatrix[234]fv();
            }
        }

        let setters = {
            setters: {}
        };

        // horrific
        for (let k in obj) {
            if (!isNaN(obj[k])) {
                setters[k] = getSetter(gl, pfx + k, obj[k]);
            } else if (obj[k] instanceof Array) {
                if (!isNaN(obj[k][0])) {
                    setters[k] = getSetter(gl, pfx + k, obj[k]);
                } else {
                    setters.setters[k] = {
                        setters: {}
                    };
                    for (let i = 0; i < obj[k].length; i++)
                        setters.setters[k].setters[i] = getSetters(gl, prog, obj[k][i], pfx + k + '[' + i + ']' + '.', depth);
                }
            } else {
                setters.setters[k] = getSetters(gl, prog, obj[k], pfx + k + '.', depth);
            }
        }

        return setters;
    }

    window.not3 = function (options) {

        var cvs,
            gl,
            buffer,
            program,
            vertex_position,
            uniforms = options ? options.uniforms || {} : {},
            uniformSetters = {},
            start_time = now(),
            scaling = options ? options.scaling || 1 : 1,
            version = '';

        //legacy
        if (options === typeof Element) {
            options = arguments[1];
            options.canvas = arguments[0];
        }

        if (!options)
            options = {};

        cvs = options.canvas || document.querySelector('canvas');

        if (!options.fragment)
            options.fragment = document.getElementById('fs').textContent.trim();

        let ln = options.fragment.indexOf('\n');
        version = options.fragment.indexOf('#version') < 0 ? '' : options.fragment.substr(0, ln + 1);
        options.fragment = options.fragment.substr(ln);

        if (!options.vertex) {
            options.vertex = version + (version.indexOf('300') < 0 ?
                'attribute vec3 position;\nvoid main() { gl_Position = vec4( position, 1.0 ); }' :
                'in vec3 position;\nvoid main() { gl_Position = vec4( position, 1.0 ); }');
        }

        init();
        requestAnimationFrame(animate);

        function init() {
            try {
                gl = cvs.getContext('webgl2') || cvs.getContext('webgl');
            } catch (e) {}

            if (!gl) {
                throw 'cannot create webgl context';
            }

            buffer = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
            gl.bufferData(gl.ARRAY_BUFFER,
                new Float32Array([-1.0, -1.0, 1.0, -1.0, -1.0, 1.0, 1.0, -1.0, 1.0, 1.0, -1.0, 1.0]),
                gl.STATIC_DRAW);

            program = createProgram(options.vertex, options.fragment);

            uniforms.time = 0;
            uniforms.resolution = [0, 0];
            uniformSetters = getSetters(gl, program, uniforms);

            if (options.textures)
                loadTextures(options.textures);
        }

        function createProgram(vertex, fragment) {
            var prog = gl.createProgram();

            var vs = createShader(vertex, gl.VERTEX_SHADER);

            fragment = fragment.trim();

            if (fragment.indexOf('precision') < 0) {
                fragment = "#ifdef GL_ES\n  precision highp float;\n#endif\n\n" + fragment;
            }

            var fs = createShader(version + '\n' + fragment, gl.FRAGMENT_SHADER);

            if (!vs || !fs) return;

            gl.attachShader(prog, vs);
            gl.attachShader(prog, fs);

            gl.deleteShader(vs);
            gl.deleteShader(fs);

            gl.linkProgram(prog);

            if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
                console.warn('ERROR - Validate status: ' + gl.getProgramParameter(prog, gl.VALIDATE_STATUS) +
                    '\n\n"' + gl.getError() + '"');
            }

            return prog;
        }

        function createShader(src, type) {
            var shader = gl.createShader(type);

            gl.shaderSource(shader, src);
            gl.compileShader(shader);

            if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
                console.error((type == gl.VERTEX_SHADER ? 'VERTEX' : 'FRAGMENT') +
                    ' SHADER:\n' +
                    gl.getShaderInfoLog(shader));

                console.warn(src.split('\n').map(function (s, i) {
                    return i + ': ' + s;
                }).join('\n'));

                return;
            }

            return shader;
        }

        function loadTextures(textures) {

            function load2d(t) {
                if (t.data.constructor === Uint8Array) {
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
                    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, t.resolution[0], t.resolution[1], 0, gl.RGBA, gl.UNSIGNED_BYTE, t.data);
                    return;
                } //todo by url
                console.error('failed to load texture', t);
            }

            function load3d(t) {
                if (t.data.constructor === Uint8Array) {
                    gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA, t.resolution[0], t.resolution[1], t.resolution[2], 0, gl.RGBA, gl.UNSIGNED_BYTE, t.data);
                    return;
                } //todo by url?
                console.error('failed to load texture', t);
            }

            textures.forEach(function (t, i) {
                let tex = gl.createTexture();
                let ttype = t.resolution.length === 2 ? gl.TEXTURE_2D : gl.TEXTURE_3D;
                gl.bindTexture(ttype, tex);
                if (t.resolution.length === 2) {
                    load2d(t);
                } else if (t.resolution.length === 2) {
                    load3d(t);
                }
            });
        }

        function resizeCanvas() {
            if (
                cvs.width != cvs.clientWidth ||
                cvs.height != cvs.clientHeight
            ) {
                cvs.width = cvs.clientWidth * scaling;
                cvs.height = cvs.clientHeight * scaling;

                uniforms.resolution = [cvs.width, cvs.height];
                gl.viewport(0, 0, cvs.width, cvs.height);
            }
        }

        function animate() {
            resizeCanvas();
            _render();
            requestAnimationFrame(animate);
        }

        function _render() {
            if (!program) return;

            gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
            gl.useProgram(program);

            let delta = now() - uniforms.time;
            uniforms.time = 0.001 * (now() - start_time);
            if (options.update)
                options.update(uniforms, delta);

            setUniforms(uniforms, uniformSetters);

            gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
            gl.vertexAttribPointer(vertex_position, 2, gl.FLOAT, false, 0, 0);
            gl.enableVertexAttribArray(vertex_position);
            gl.drawArrays(gl.TRIANGLES, 0, 6);
            gl.disableVertexAttribArray(vertex_position);
        }

        function setUniforms(obj, setters) {
            if (setters)
                for (let k in obj)
                    if (!setters[k])
                        setUniforms(obj[k], setters.setters[k]);
                    else if (setters[k] instanceof Function)
                setters[k](obj[k]);
        }
    }
})();