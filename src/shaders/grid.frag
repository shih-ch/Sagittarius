#version 300 es
// grid.frag — Curved spacetime coordinate grid visualization
// Sagittarius Black Hole Simulation
//
// Same geodesic ray marching as blackhole.frag, but renders a
// coordinate grid (concentric circles + radial lines) instead of
// disk + starfield. Shows gravitational lensing distortion directly.

precision highp float;
precision highp int;

// --- Uniforms (same contract as blackhole.frag) ---
uniform vec2  u_resolution;
uniform vec3  u_cameraPos;
uniform mat4  u_invViewProjection;
uniform float u_mass;
uniform float u_time;
uniform int   u_maxSteps;
uniform float u_stepSize;
uniform int   u_showDisk;
uniform int   u_showGrid;
uniform sampler2D u_starfield;

// --- I/O ---
in vec2 v_uv;
out vec4 fragColor;

// --- Constants ---
const float PI = 3.14159265358979;
const float TWO_PI = 6.28318530717959;
const float ESCAPE_MULT = 3.0;
const float MIN_ESCAPE = 80.0;
const int   MAX_LOOP = 10000;

// ============================================================
// Grid pattern on the sky sphere
// ============================================================

vec3 gridPattern(vec3 dir) {
    // Spherical coordinates of the escaped ray direction
    float theta = atan(dir.z, dir.x);                     // azimuthal [-PI, PI]
    float phi   = acos(clamp(dir.y, -1.0, 1.0));          // polar [0, PI]

    // Concentric circles: constant polar angle spacing (every 15 degrees)
    float circleSpacing = PI / 12.0;
    float circlePhase = mod(phi, circleSpacing) / circleSpacing;
    float circleLine = smoothstep(0.03, 0.0, min(circlePhase, 1.0 - circlePhase));

    // Radial lines: constant azimuthal angle spacing (every 15 degrees)
    float radialSpacing = PI / 12.0;
    float radialPhase = mod(theta + PI, radialSpacing) / radialSpacing;
    float radialLine = smoothstep(0.03, 0.0, min(radialPhase, 1.0 - radialPhase));

    // Adjust line thickness based on polar angle (thinner near poles)
    float poleWeight = sin(phi);
    radialLine *= smoothstep(0.0, 0.1, poleWeight);

    // Color: cyan for concentric circles, green for radial lines
    vec3 color = vec3(0.0);
    color += vec3(0.0, 0.9, 1.0) * circleLine * 0.8;
    color += vec3(0.0, 1.0, 0.3) * radialLine * 0.6;

    // Where both lines cross: brighter
    color += vec3(0.5, 1.0, 0.8) * circleLine * radialLine * 0.4;

    // Faint background dots at grid intersections
    float dotPhase = smoothstep(0.04, 0.0, min(circlePhase, 1.0 - circlePhase))
                   * smoothstep(0.04, 0.0, min(radialPhase, 1.0 - radialPhase));
    color += vec3(1.0) * dotPhase * 0.3;

    return color;
}

// ============================================================
// Geodesic equations (identical to blackhole.frag)
// ============================================================

vec4 geodesicDerivs(vec4 state, float rs) {
    float r    = max(state.x, 0.001);
    float vr   = state.z;
    float vphi = state.w;

    float d2r   = -rs / (2.0 * r * r) + r * vphi * vphi;
    float d2phi = -(2.0 / r) * vr * vphi;

    return vec4(vr, vphi, d2r, d2phi);
}

// ============================================================
// Main
// ============================================================

void main() {
    // 1. Ray setup
    vec2 ndc = v_uv * 2.0 - 1.0;

    vec4 nearWorld = u_invViewProjection * vec4(ndc, -1.0, 1.0);
    vec4 farWorld  = u_invViewProjection * vec4(ndc,  1.0, 1.0);
    nearWorld.xyz /= nearWorld.w;
    farWorld.xyz  /= farWorld.w;

    vec3 rayOrigin = u_cameraPos;
    vec3 rayDir    = normalize(farWorld.xyz - nearWorld.xyz);

    // 2. Orbital plane
    float r0 = length(rayOrigin);
    float rs = 2.0 * u_mass;

    // Camera inside event horizon
    if (r0 <= rs && rs > 0.0) {
        fragColor = vec4(0.0, 0.0, 0.0, 1.0);
        return;
    }

    vec3 e1 = rayOrigin / r0;
    float drInit = dot(rayDir, e1);
    vec3 tangent = rayDir - drInit * e1;
    float tangentLen = length(tangent);

    vec3 e2;
    if (tangentLen > 1.0e-6) {
        e2 = tangent / tangentLen;
    } else {
        vec3 up = abs(e1.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
        e2 = normalize(cross(e1, up));
    }

    // 3. Initial state
    float r    = r0;
    float phi  = 0.0;
    float vr   = drInit;
    float vphi = tangentLen / r0;

    float escapeR = max(MIN_ESCAPE, r0 * ESCAPE_MULT);
    float h       = u_stepSize;

    vec3 color     = vec3(0.0);
    bool hitSomething = false;

    // 4. RK4 loop
    for (int i = 0; i < MAX_LOOP; i++) {
        if (i >= u_maxSteps) break;

        float adaptH = h * clamp(r / (4.0 * rs + 0.001), 0.15, 1.0);

        vec4 state = vec4(r, phi, vr, vphi);

        vec4 k1 = adaptH * geodesicDerivs(state, rs);
        vec4 k2 = adaptH * geodesicDerivs(state + k1 * 0.5, rs);
        vec4 k3 = adaptH * geodesicDerivs(state + k2 * 0.5, rs);
        vec4 k4 = adaptH * geodesicDerivs(state + k3, rs);

        state += (k1 + 2.0 * k2 + 2.0 * k3 + k4) / 6.0;

        r    = state.x;
        phi  = state.y;
        vr   = state.z;
        vphi = state.w;

        // Event horizon
        if (r <= rs && rs > 0.0) {
            color = vec3(0.0);
            hitSomething = true;
            break;
        }

        // Escape: render grid pattern
        if (r > escapeR) {
            vec3 rhat   = cos(phi) * e1 + sin(phi) * e2;
            vec3 phihat = -sin(phi) * e1 + cos(phi) * e2;
            vec3 escapeDir = normalize(vr * rhat + r * vphi * phihat);

            color = gridPattern(escapeDir);
            hitSomething = true;
            break;
        }
    }

    if (!hitSomething) {
        color = vec3(0.0);
    }

    // Tone mapping + gamma
    color = color / (1.0 + color);
    color = pow(color, vec3(1.0 / 2.2));

    fragColor = vec4(color, 1.0);
}
