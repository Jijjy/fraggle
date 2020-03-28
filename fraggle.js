window.not3 = opt => {
    const now = (performance && performance.now) ? (() => performance.now()) : (() => new Date().getTime());

    opt = Object.assign({
        fragment: document.getElementById('fs').textContent.trim(),
        canvas: document.querySelector('canvas')
    }, opt);

    let ln = opt.fragment.indexOf('\n');
    const version = opt.fragment.indexOf('#version') < 0 ? '' : opt.fragment.substr(0, ln + 1);
    opt.fragment = opt.fragment.substr(ln);

    if (!opt.vertex)
        opt.vertex = version + (version.indexOf('300') < 0 ? 'attribute' : 'in') +
            ' vec3 position;\nvoid main(){gl_Position=vec4(position,1.);}';

    const cvs = opt.canvas,
        gl = cvs.getContext('webgl2') || cvs.getContext('webgl'),
        buf = gl.createBuffer(),
        prog = createProgram(opt.vertex, opt.fragment),
        glSetters = {
            1: (i, v) => gl.uniform1f(i, v),
            2: (i, v) => gl.uniform2fv(i, v),
            3: (i, v) => gl.uniform3fv(i, v),
            4: (i, v) => gl.uniform4fv(i, v),
            9: (i, v) => gl.uniformMatrix3fv(i, false, v),
            16: (i, v) => gl.uniformMatrix4fv(i, false, v)
        },
        vLoc = 0,
        uniforms = Object.assign(opt.uniforms, { time: 0, resolution: [0, 0] }),
        setters = getSetters(gl, prog, uniforms);

    var tStart = now(),
        scaling = opt ? opt.scaling || 1 : 1;

    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER,
        new Float32Array([-1, -1, 1, -1, -1, 1, 1, -1, 1, 1, -1, 1]),
        gl.STATIC_DRAW);

    function createProgram(vtx, frg) {
        const p = gl.createProgram(),
            vs = createShader(vtx, gl.VERTEX_SHADER);

        frg = frg.trim();

        if (frg.indexOf('precision') < 0)
            frg = "#ifdef GL_ES\n precision highp float;\n#endif\n\n" + frg;

        var fs = createShader(version + '\n' + frg, gl.FRAGMENT_SHADER);

        if (!vs || !fs) return;

        gl.attachShader(p, vs);
        gl.attachShader(p, fs);

        gl.deleteShader(vs);
        gl.deleteShader(fs);

        gl.linkProgram(p);

        if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
            console.warn('ERROR: ' + gl.getProgramParameter(p, gl.VALIDATE_STATUS) +
                '\n\n"' + gl.getError() + '"');
        }

        return p;
    }

    function createShader(src, type) {
        var shader = gl.createShader(type);

        gl.shaderSource(shader, src);
        gl.compileShader(shader);

        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            console.error((type == gl.VERTEX_SHADER ? 'VERT' : 'FRAG') +
                ' SHADER:\n' +
                gl.getShaderInfoLog(shader));

            console.warn(src.split('\n').map((s, i) => i + ': ' + s).join('\n'));

            return;
        }

        return shader;
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

    (function render() {
        resizeCanvas();

        if (!prog) return;

        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.useProgram(prog);

        let delta = now() - uniforms.time;
        uniforms.time = 0.001 * (now() - tStart);
        if (opt.update)
            opt.update(uniforms, delta);

        for (let k in uniforms) {
            setters[k].set(uniforms[k]);
        }

        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.vertexAttribPointer(vLoc, 2, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(vLoc);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        gl.disableVertexAttribArray(vLoc);

        requestAnimationFrame(render);
    })();

    function getSetters(gl, prog, obj) {
        let r = {};
        for (let k in obj) {
            r[k] = { loc: gl.getUniformLocation(prog, k), set: function (val) { glSetters[obj[k].length || 1](this.loc, val); } };
        }
        return r;
    }
}
