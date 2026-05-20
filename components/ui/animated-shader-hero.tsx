"use client";

import React, { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

export interface AnimatedShaderHeroProps {
  trustBadge?: {
    text: string;
    icons?: string[];
  };
  headline: {
    line1: string;
    line2: string;
  };
  subtitle: string;
  buttons?: {
    primary?: {
      text: string;
      href?: string;
      onClick?: () => void;
    };
    secondary?: {
      text: string;
      href?: string;
      onClick?: () => void;
    };
  };
  className?: string;
}

type Point = [number, number];

const iconColorClasses = ["text-yellow-300", "text-orange-300", "text-amber-300"];

const useShaderBackground = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const rendererRef = useRef<WebGLRenderer | null>(null);
  const pointersRef = useRef<PointerHandler | null>(null);

  class WebGLRenderer {
    private canvas: HTMLCanvasElement;
    private gl: WebGL2RenderingContext;
    private program: WebGLProgram | null = null;
    private vs: WebGLShader | null = null;
    private fs: WebGLShader | null = null;
    private buffer: WebGLBuffer | null = null;
    private scale: number;
    private shaderSource: string;
    private mouseMove: Point = [0, 0];
    private mouseCoords: Point = [0, 0];
    private pointerCoords: number[] = [0, 0];
    private nbrOfPointers = 0;

    private vertexSrc = `#version 300 es
precision highp float;
in vec4 position;
void main(){gl_Position=position;}`;

    private vertices = [-1, 1, -1, -1, 1, 1, 1, -1];

    constructor(canvas: HTMLCanvasElement, scale: number) {
      this.canvas = canvas;
      this.scale = scale;

      const gl = canvas.getContext("webgl2");

      if (!gl) {
        throw new Error("WebGL2 is not supported in this browser.");
      }

      this.gl = gl;
      this.gl.viewport(0, 0, canvas.width * scale, canvas.height * scale);
      this.shaderSource = defaultShaderSource;
    }

    updateShader(source: string) {
      this.reset();
      this.shaderSource = source;
      this.setup();
      this.init();
    }

    updateMove(deltas: Point) {
      this.mouseMove = deltas;
    }

    updateMouse(coords: Point) {
      this.mouseCoords = coords;
    }

    updatePointerCoords(coords: number[]) {
      this.pointerCoords = coords;
    }

    updatePointerCount(nbr: number) {
      this.nbrOfPointers = nbr;
    }

    updateScale(scale: number) {
      this.scale = scale;
      this.gl.viewport(0, 0, this.canvas.width * scale, this.canvas.height * scale);
    }

    compile(shader: WebGLShader, source: string) {
      const gl = this.gl;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);

      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const error = gl.getShaderInfoLog(shader);
        console.error("Shader compilation error:", error);
      }
    }

    test(source: string) {
      let result = null;
      const gl = this.gl;
      const shader = gl.createShader(gl.FRAGMENT_SHADER);

      if (!shader) {
        return "Unable to create fragment shader.";
      }

      gl.shaderSource(shader, source);
      gl.compileShader(shader);

      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        result = gl.getShaderInfoLog(shader);
      }

      gl.deleteShader(shader);
      return result;
    }

    reset() {
      const gl = this.gl;

      if (this.program && !gl.getProgramParameter(this.program, gl.DELETE_STATUS)) {
        if (this.vs) {
          gl.detachShader(this.program, this.vs);
          gl.deleteShader(this.vs);
        }

        if (this.fs) {
          gl.detachShader(this.program, this.fs);
          gl.deleteShader(this.fs);
        }

        gl.deleteProgram(this.program);
      }

      if (this.buffer) {
        gl.deleteBuffer(this.buffer);
        this.buffer = null;
      }
    }

    setup() {
      const gl = this.gl;
      this.vs = gl.createShader(gl.VERTEX_SHADER);
      this.fs = gl.createShader(gl.FRAGMENT_SHADER);

      if (!this.vs || !this.fs) {
        console.error("Unable to create shader program.");
        return;
      }

      this.compile(this.vs, this.vertexSrc);
      this.compile(this.fs, this.shaderSource);
      this.program = gl.createProgram();

      if (!this.program) {
        console.error("Unable to create WebGL program.");
        return;
      }

      gl.attachShader(this.program, this.vs);
      gl.attachShader(this.program, this.fs);
      gl.linkProgram(this.program);

      if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
        console.error(gl.getProgramInfoLog(this.program));
      }
    }

    init() {
      const gl = this.gl;
      const program = this.program;

      if (!program) return;

      this.buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(this.vertices), gl.STATIC_DRAW);

      const position = gl.getAttribLocation(program, "position");
      gl.enableVertexAttribArray(position);
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

      const uniforms = program as WebGLProgram & {
        resolution?: WebGLUniformLocation | null;
        time?: WebGLUniformLocation | null;
        move?: WebGLUniformLocation | null;
        touch?: WebGLUniformLocation | null;
        pointerCount?: WebGLUniformLocation | null;
        pointers?: WebGLUniformLocation | null;
      };

      uniforms.resolution = gl.getUniformLocation(program, "resolution");
      uniforms.time = gl.getUniformLocation(program, "time");
      uniforms.move = gl.getUniformLocation(program, "move");
      uniforms.touch = gl.getUniformLocation(program, "touch");
      uniforms.pointerCount = gl.getUniformLocation(program, "pointerCount");
      uniforms.pointers = gl.getUniformLocation(program, "pointers");
    }

    render(now = 0) {
      const gl = this.gl;
      const program = this.program;

      if (!program || gl.getProgramParameter(program, gl.DELETE_STATUS)) return;

      const uniforms = program as WebGLProgram & {
        resolution?: WebGLUniformLocation | null;
        time?: WebGLUniformLocation | null;
        move?: WebGLUniformLocation | null;
        touch?: WebGLUniformLocation | null;
        pointerCount?: WebGLUniformLocation | null;
        pointers?: WebGLUniformLocation | null;
      };

      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(program);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);

      gl.uniform2f(uniforms.resolution ?? null, this.canvas.width, this.canvas.height);
      gl.uniform1f(uniforms.time ?? null, now * 1e-3);
      gl.uniform2f(uniforms.move ?? null, this.mouseMove[0], this.mouseMove[1]);
      gl.uniform2f(uniforms.touch ?? null, this.mouseCoords[0], this.mouseCoords[1]);
      gl.uniform1i(uniforms.pointerCount ?? null, this.nbrOfPointers);
      gl.uniform2fv(uniforms.pointers ?? null, this.pointerCoords);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
  }

  class PointerHandler {
    private scale: number;
    private active = false;
    private pointers = new Map<number, Point>();
    private lastCoords: Point = [0, 0];
    private moves: Point = [0, 0];

    constructor(element: HTMLCanvasElement, scale: number) {
      this.scale = scale;

      const map = (target: HTMLCanvasElement, currentScale: number, x: number, y: number): Point => [
        x * currentScale,
        target.height - y * currentScale
      ];

      element.addEventListener("pointerdown", (event) => {
        this.active = true;
        this.pointers.set(event.pointerId, map(element, this.getScale(), event.clientX, event.clientY));
      });

      element.addEventListener("pointerup", (event) => {
        if (this.count === 1) {
          this.lastCoords = this.first;
        }

        this.pointers.delete(event.pointerId);
        this.active = this.pointers.size > 0;
      });

      element.addEventListener("pointerleave", (event) => {
        if (this.count === 1) {
          this.lastCoords = this.first;
        }

        this.pointers.delete(event.pointerId);
        this.active = this.pointers.size > 0;
      });

      element.addEventListener("pointermove", (event) => {
        if (!this.active) return;

        this.lastCoords = [event.clientX, event.clientY];
        this.pointers.set(event.pointerId, map(element, this.getScale(), event.clientX, event.clientY));
        this.moves = [this.moves[0] + event.movementX, this.moves[1] + event.movementY];
      });
    }

    getScale() {
      return this.scale;
    }

    updateScale(scale: number) {
      this.scale = scale;
    }

    get count() {
      return this.pointers.size;
    }

    get move() {
      return this.moves;
    }

    get coords() {
      return this.pointers.size > 0 ? Array.from(this.pointers.values()).flat() : [0, 0];
    }

    get first(): Point {
      return this.pointers.values().next().value ?? this.lastCoords;
    }
  }

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) return;

    const resize = () => {
      const dpr = Math.max(1, 0.5 * window.devicePixelRatio);

      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;

      rendererRef.current?.updateScale(dpr);
      pointersRef.current?.updateScale(dpr);
    };

    const loop = (now: number) => {
      if (!rendererRef.current || !pointersRef.current) return;

      rendererRef.current.updateMouse(pointersRef.current.first);
      rendererRef.current.updatePointerCount(pointersRef.current.count);
      rendererRef.current.updatePointerCoords(pointersRef.current.coords);
      rendererRef.current.updateMove(pointersRef.current.move);
      rendererRef.current.render(now);
      animationFrameRef.current = requestAnimationFrame(loop);
    };

    try {
      const dpr = Math.max(1, 0.5 * window.devicePixelRatio);

      rendererRef.current = new WebGLRenderer(canvas, dpr);
      pointersRef.current = new PointerHandler(canvas, dpr);

      rendererRef.current.setup();
      rendererRef.current.init();

      resize();

      if (rendererRef.current.test(defaultShaderSource) === null) {
        rendererRef.current.updateShader(defaultShaderSource);
      }

      loop(0);
      window.addEventListener("resize", resize);
    } catch (error) {
      console.error(error);
    }

    return () => {
      window.removeEventListener("resize", resize);

      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }

      rendererRef.current?.reset();
    };
  }, []);

  return canvasRef;
};

const AnimatedShaderHero: React.FC<AnimatedShaderHeroProps> = ({
  trustBadge,
  headline,
  subtitle,
  buttons,
  className
}) => {
  const canvasRef = useShaderBackground();

  return (
    <div className={cn("relative h-screen w-full overflow-hidden bg-black", className)}>
      <style>{`
        @keyframes fade-in-down {
          from {
            opacity: 0;
            transform: translateY(-20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes fade-in-up {
          from {
            opacity: 0;
            transform: translateY(30px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .animate-fade-in-down {
          animation: fade-in-down 0.8s ease-out forwards;
        }

        .animate-fade-in-up {
          animation: fade-in-up 0.8s ease-out forwards;
          opacity: 0;
        }

        .animation-delay-200 {
          animation-delay: 0.2s;
        }

        .animation-delay-400 {
          animation-delay: 0.4s;
        }

        .animation-delay-600 {
          animation-delay: 0.6s;
        }

        .animation-delay-800 {
          animation-delay: 0.8s;
        }

        @keyframes gradient-shift {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }

        .animate-gradient {
          background-size: 200% 200%;
          animation: gradient-shift 3s ease infinite;
        }
      `}</style>

      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none object-contain"
        style={{ background: "black" }}
      />

      <div className="absolute inset-0 z-10 flex flex-col items-center justify-center text-white">
        {trustBadge && (
          <div className="mb-8 animate-fade-in-down">
            <div className="flex items-center gap-2 rounded-full border border-orange-300/30 bg-orange-500/10 px-6 py-3 text-sm backdrop-blur-md">
              {trustBadge.icons && (
                <div className="flex">
                  {trustBadge.icons.map((icon, index) => (
                    <span key={`${icon}-${index}`} className={iconColorClasses[index % iconColorClasses.length]}>
                      {icon}
                    </span>
                  ))}
                </div>
              )}
              <span className="text-orange-100">{trustBadge.text}</span>
            </div>
          </div>
        )}

        <div className="mx-auto max-w-5xl space-y-6 px-4 text-center">
          <div className="space-y-2">
            <h1 className="animate-fade-in-up bg-gradient-to-r from-orange-300 via-yellow-400 to-amber-300 bg-clip-text text-5xl font-bold text-transparent animation-delay-200 md:text-7xl lg:text-8xl">
              {headline.line1}
            </h1>
            <h1 className="animate-fade-in-up bg-gradient-to-r from-yellow-300 via-orange-400 to-red-400 bg-clip-text text-5xl font-bold text-transparent animation-delay-400 md:text-7xl lg:text-8xl">
              {headline.line2}
            </h1>
          </div>

          <div className="mx-auto max-w-3xl animate-fade-in-up animation-delay-600">
            <p className="text-lg font-light leading-relaxed text-orange-100/90 md:text-xl lg:text-2xl">
              {subtitle}
            </p>
          </div>

          {buttons && (
            <div className="mt-10 flex animate-fade-in-up flex-col justify-center gap-4 animation-delay-800 sm:flex-row">
              {buttons.primary && (
                buttons.primary.href ? (
                  <a
                    href={buttons.primary.href}
                    className="rounded-full bg-gradient-to-r from-orange-500 to-yellow-500 px-8 py-4 text-lg font-semibold text-black transition-all duration-300 hover:scale-105 hover:from-orange-600 hover:to-yellow-600 hover:shadow-xl hover:shadow-orange-500/25"
                  >
                    {buttons.primary.text}
                  </a>
                ) : (
                  <button
                    type="button"
                    onClick={buttons.primary.onClick}
                    className="rounded-full bg-gradient-to-r from-orange-500 to-yellow-500 px-8 py-4 text-lg font-semibold text-black transition-all duration-300 hover:scale-105 hover:from-orange-600 hover:to-yellow-600 hover:shadow-xl hover:shadow-orange-500/25"
                  >
                    {buttons.primary.text}
                  </button>
                )
              )}
              {buttons.secondary && (
                buttons.secondary.href ? (
                  <a
                    href={buttons.secondary.href}
                    className="rounded-full border border-orange-300/30 bg-orange-500/10 px-8 py-4 text-lg font-semibold text-orange-100 backdrop-blur-sm transition-all duration-300 hover:scale-105 hover:border-orange-300/50 hover:bg-orange-500/20"
                  >
                    {buttons.secondary.text}
                  </a>
                ) : (
                  <button
                    type="button"
                    onClick={buttons.secondary.onClick}
                    className="rounded-full border border-orange-300/30 bg-orange-500/10 px-8 py-4 text-lg font-semibold text-orange-100 backdrop-blur-sm transition-all duration-300 hover:scale-105 hover:border-orange-300/50 hover:bg-orange-500/20"
                  >
                    {buttons.secondary.text}
                  </button>
                )
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const defaultShaderSource = `#version 300 es
/*********
* made by Matthias Hurrle (@atzedent)
*
* To explore strange new worlds, to seek out new life
* and new civilizations, to boldly go where no man has
* gone before.
*/
precision highp float;
out vec4 O;
uniform vec2 resolution;
uniform float time;
#define FC gl_FragCoord.xy
#define T time
#define R resolution
#define MN min(R.x,R.y)
// Returns a pseudo random number for a given point (white noise)
float rnd(vec2 p) {
  p=fract(p*vec2(12.9898,78.233));
  p+=dot(p,p+34.56);
  return fract(p.x*p.y);
}
// Returns a pseudo random number for a given point (value noise)
float noise(in vec2 p) {
  vec2 i=floor(p), f=fract(p), u=f*f*(3.-2.*f);
  float
  a=rnd(i),
  b=rnd(i+vec2(1,0)),
  c=rnd(i+vec2(0,1)),
  d=rnd(i+1.);
  return mix(mix(a,b,u.x),mix(c,d,u.x),u.y);
}
// Returns a pseudo random number for a given point (fractal noise)
float fbm(vec2 p) {
  float t=.0, a=1.; mat2 m=mat2(1.,-.5,.2,1.2);
  for (int i=0; i<5; i++) {
    t+=a*noise(p);
    p*=2.*m;
    a*=.5;
  }
  return t;
}
float clouds(vec2 p) {
  float d=1., t=.0;
  for (float i=.0; i<3.; i++) {
    float a=d*fbm(i*10.+p.x*.2+.2*(1.+i)*p.y+d+i*i+p);
    t=mix(t,d,a);
    d=a;
    p*=2./(i+1.);
  }
  return t;
}
void main(void) {
  vec2 uv=(FC-.5*R)/MN,st=uv*vec2(2,1);
  vec3 col=vec3(0);
  float bg=clouds(vec2(st.x+T*.5,-st.y));
  uv*=1.-.3*(sin(T*.2)*.5+.5);
  for (float i=1.; i<12.; i++) {
    uv+=.1*cos(i*vec2(.1+.01*i, .8)+i*i+T*.5+.1*uv.x);
    vec2 p=uv;
    float d=length(p);
    col+=.00125/d*(cos(sin(i)*vec3(1,2,3))+1.);
    float b=noise(i+p+bg*1.731);
    col+=.002*b/length(max(p,vec2(b*p.x*.02,p.y)));
    col=mix(col,vec3(bg*.25,bg*.137,bg*.05),d);
  }
  O=vec4(col,1);
}`;

export default AnimatedShaderHero;
