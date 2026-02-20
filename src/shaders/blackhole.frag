#version 300 es
// blackhole.frag — Schwarzschild black hole ray marching
// Sagittarius Black Hole Simulation
//
// Geometrized units: G=1, c=1, rs = 2*mass
// Geodesic equations (equatorial plane):
//   d2phi/dl2 = -(2/r) * (dr/dl) * (dphi/dl)
//   d2r/dl2   = -rs/(2*r^2) + r * (dphi/dl)^2
// Integrated with RK4.

precision highp float;
precision highp int;

// --- Uniforms (contract with renderer) ---
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
const float DISK_INNER_RATIO = 3.0;   // inner edge = 3 * rs = ISCO
const float DISK_OUTER_RATIO = 12.0;  // outer edge = 12 * rs
const float ESCAPE_MULT = 3.0;        // escape at 3x camera distance
const float MIN_ESCAPE = 80.0;
const int   MAX_LOOP = 10000;         // compile-time loop guard

// ============================================================
// Utility
// ============================================================

float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float hash3(vec3 p) {
    return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
}

// ============================================================
// Procedural starfield (fallback when no texture)
// ============================================================

vec3 proceduralStars(vec3 dir) {
    float u = atan(dir.z, dir.x) / TWO_PI + 0.5;
    float v = asin(clamp(dir.y, -1.0, 1.0)) / PI + 0.5;

    vec3 color = vec3(0.0);

    // Fine dim stars
    vec2 g1 = floor(vec2(u, v) * 800.0);
    float h1 = hash(g1);
    float s1 = smoothstep(0.985, 1.0, h1);
    color += vec3(0.8, 0.9, 1.0) * s1 * 0.4;

    // Medium stars
    vec2 g2 = floor(vec2(u, v) * 200.0);
    float h2 = hash(g2);
    float s2 = smoothstep(0.98, 1.0, h2);
    float t2 = hash(g2 + 50.0);
    vec3 c2 = mix(vec3(1.0, 0.85, 0.7), vec3(0.7, 0.85, 1.0), t2);
    color += c2 * s2;

    // Bright stars
    vec2 g3 = floor(vec2(u, v) * 50.0);
    float h3 = hash(g3);
    float s3 = smoothstep(0.97, 1.0, h3);
    float t3 = hash(g3 + 100.0);
    vec3 c3 = mix(vec3(1.0, 0.9, 0.7), vec3(0.8, 0.9, 1.0), t3);
    color += c3 * s3 * 2.0;

    // Faint background glow (milky way hint)
    float mw = exp(-10.0 * (v - 0.5) * (v - 0.5)) * 0.015;
    color += vec3(0.6, 0.5, 0.8) * mw;

    return color;
}

// ============================================================
// Starfield sampling: texture with procedural fallback
// ============================================================

vec3 sampleStarfield(vec3 dir) {
    float u = atan(dir.z, dir.x) / TWO_PI + 0.5;
    float v = asin(clamp(dir.y, -1.0, 1.0)) / PI + 0.5;

    // If a real texture is bound (larger than 2x2 default), use it
    ivec2 texSize = textureSize(u_starfield, 0);
    if (texSize.x > 2) {
        return texture(u_starfield, vec2(u, v)).rgb;
    }

    return proceduralStars(dir);
}

// ============================================================
// Noise functions for disk turbulence
// ============================================================

float noise2D(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f); // smoothstep
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p, int octaves) {
    float val = 0.0;
    float amp = 0.5;
    float freq = 1.0;
    for (int i = 0; i < 5; i++) {
        if (i >= octaves) break;
        val += amp * noise2D(p * freq);
        freq *= 2.0;
        amp *= 0.5;
    }
    return val;
}

// ============================================================
// Accretion disk color + opacity (semi-transparent, turbulent)
// Returns vec4: rgb = emitted color, a = opacity
// ============================================================

vec4 accretionDiskSample(float r, float rs, vec3 hitPos, vec3 rayDir, float planeDistY) {
    float rInner = DISK_INNER_RATIO * rs;
    float rOuter = DISK_OUTER_RATIO * rs;

    // Normalized radial position: 0 at inner edge, 1 at outer edge
    float t = clamp((r - rInner) / (rOuter - rInner), 0.0, 1.0);

    // --- Disk vertical thickness (Gaussian density falloff) ---
    // Disk half-thickness grows with radius
    float diskH = rs * (0.05 + 0.15 * t);
    float verticalDensity = exp(-0.5 * (planeDistY * planeDistY) / (diskH * diskH));

    // --- Soft inner edge (no hard cutoff at ISCO) ---
    float innerFade = smoothstep(rInner - 0.3 * rs, rInner + 0.5 * rs, r);
    float outerFade = 1.0 - smoothstep(rOuter - rs, rOuter, r);

    // --- Turbulent disk structure ---
    // Polar angle in disk plane
    float angle = atan(hitPos.z, hitPos.x);
    // Spiral arm pattern: logarithmic spirals rotating with time
    float logR = log(r / rInner + 1.0);
    float spiral1 = sin(4.0 * angle - 8.0 * logR + u_time * 0.15) * 0.5 + 0.5;
    float spiral2 = sin(3.0 * angle + 6.0 * logR - u_time * 0.1 + 2.0) * 0.5 + 0.5;
    float spirals = mix(spiral1, spiral2, 0.5);
    spirals = smoothstep(0.15, 0.85, spirals);

    // Fractal noise for fine turbulence
    vec2 noiseCoord = vec2(angle * 3.0 + u_time * 0.05, logR * 6.0);
    float turb = fbm(noiseCoord, 4);

    // Combine turbulence: spirals modulated by noise
    float structure = mix(0.5, 1.0, spirals * 0.6 + turb * 0.4);

    // Hot clumps near inner edge
    float clumps = noise2D(vec2(angle * 8.0 + u_time * 0.3, r / rs * 4.0));
    clumps = smoothstep(0.55, 0.9, clumps) * (1.0 - t) * 0.5;

    // --- Temperature gradient ---
    // Novikov-Thorne-ish: temperature ~ r^(-3/4) with ISCO correction
    float tempFactor = pow(max(rInner / r, 0.01), 0.75);
    // Inner orbits are MUCH hotter
    vec3 innerColor = vec3(1.0, 1.0, 1.4);   // blue-white (very hot)
    vec3 hotColor   = vec3(1.0, 0.85, 0.5);  // white-yellow
    vec3 warmColor  = vec3(1.0, 0.55, 0.12); // orange
    vec3 outerColor = vec3(0.6, 0.12, 0.02); // deep red (cool)

    vec3 baseColor;
    if (t < 0.15) {
        baseColor = mix(innerColor, hotColor, t / 0.15);
    } else if (t < 0.45) {
        baseColor = mix(hotColor, warmColor, (t - 0.15) / 0.3);
    } else {
        baseColor = mix(warmColor, outerColor, (t - 0.45) / 0.55);
    }

    // Hot clumps shift color toward white
    baseColor = mix(baseColor, vec3(1.0, 0.95, 0.9), clumps);

    // --- Luminosity profile: ~ r^(-3) (flux from accretion physics) ---
    float x = rInner / r;
    float intensity = x * x * x * 12.0;
    // Boost very inner edge (ISCO glow)
    intensity += exp(-((r - rInner) / (0.5 * rs)) * ((r - rInner) / (0.5 * rs))) * 3.0;

    // --- Gravitational redshift: sqrt(1 - rs/r) ---
    float redshift = sqrt(max(1.0 - rs / r, 0.0));

    // --- Doppler shift from Keplerian orbital motion ---
    float vOrb = sqrt(max(u_mass / r, 0.0));
    vec3 diskRadial = normalize(vec3(hitPos.x, 0.0, hitPos.z));
    vec3 diskVel = normalize(cross(vec3(0.0, 1.0, 0.0), diskRadial));
    float dopplerShift = dot(normalize(rayDir), diskVel) * vOrb;
    float doppler = clamp(1.0 + 2.0 * dopplerShift, 0.2, 4.0);

    // Doppler also shifts color temperature
    vec3 dopplerColor = baseColor;
    if (dopplerShift > 0.0) {
        dopplerColor = mix(baseColor, vec3(0.7, 0.8, 1.2), dopplerShift * vOrb * 0.8);
    } else {
        dopplerColor = mix(baseColor, vec3(1.2, 0.4, 0.1), -dopplerShift * vOrb * 0.6);
    }

    vec3 finalColor = dopplerColor * intensity * redshift * doppler * structure;

    // --- Opacity: denser at center, fades at edges ---
    float opacity = verticalDensity * innerFade * outerFade;
    opacity *= (0.7 + 0.3 * structure); // turbulence affects density too
    opacity = clamp(opacity * 0.85, 0.0, 0.95);

    return vec4(finalColor, opacity);
}

// ============================================================
// Geodesic equations: state = (r, phi, dr/dl, dphi/dl)
// Returns derivatives: (dr/dl, dphi/dl, d2r/dl2, d2phi/dl2)
// ============================================================

vec4 geodesicDerivs(vec4 state, float rs) {
    float r    = max(state.x, 0.001); // guard against singularity
    float vr   = state.z;
    float vphi = state.w;

    // d2r/dl2   = -rs/(2*r^2) + r * vphi^2
    float d2r = -rs / (2.0 * r * r) + r * vphi * vphi;
    // d2phi/dl2 = -(2/r) * vr * vphi   (angular momentum conservation)
    float d2phi = -(2.0 / r) * vr * vphi;

    return vec4(vr, vphi, d2r, d2phi);
}

// ============================================================
// Main
// ============================================================

void main() {
    // ----- 1. Ray setup via inverse view-projection -----
    vec2 ndc = v_uv * 2.0 - 1.0;

    vec4 nearWorld = u_invViewProjection * vec4(ndc, -1.0, 1.0);
    vec4 farWorld  = u_invViewProjection * vec4(ndc,  1.0, 1.0);
    nearWorld.xyz /= nearWorld.w;
    farWorld.xyz  /= farWorld.w;

    vec3 rayOrigin = u_cameraPos;
    vec3 rayDir    = normalize(farWorld.xyz - nearWorld.xyz);

    // ----- 2. Project ray into orbital plane (BH-centric polars) -----
    float r0 = length(rayOrigin);
    float rs = 2.0 * u_mass;

    // Graceful fallback: camera inside event horizon
    if (r0 <= rs && rs > 0.0) {
        fragColor = vec4(0.0, 0.0, 0.0, 1.0);
        return;
    }

    // Orbital plane basis vectors
    vec3 e1 = rayOrigin / r0;                       // radial (toward camera)
    float drInit = dot(rayDir, e1);                  // radial velocity component
    vec3 tangent = rayDir - drInit * e1;             // tangential component
    float tangentLen = length(tangent);

    vec3 e2;
    if (tangentLen > 1.0e-6) {
        e2 = tangent / tangentLen;
    } else {
        // Purely radial ray: pick arbitrary tangent
        vec3 up = abs(e1.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
        e2 = normalize(cross(e1, up));
    }

    // ----- 3. Initial geodesic state -----
    float r    = r0;
    float phi  = 0.0;
    float vr   = drInit;
    float vphi = tangentLen / r0;

    float rInner  = DISK_INNER_RATIO * rs;
    float rOuter  = DISK_OUTER_RATIO * rs;
    float escapeR = max(MIN_ESCAPE, r0 * ESCAPE_MULT);
    float h       = u_stepSize;

    vec3 accumColor = vec3(0.0);
    float accumAlpha = 0.0;
    bool terminated = false;

    // ----- 4. RK4 ray march loop (with disk accumulation) -----
    for (int i = 0; i < MAX_LOOP; i++) {
        if (i >= u_maxSteps) break;

        // Current 3D position (for disk crossing detection)
        vec3 prevPos = r * (cos(phi) * e1 + sin(phi) * e2);
        float prevY  = prevPos.y;

        // Adaptive step: smaller steps near BH for accuracy
        float adaptH = h * clamp(r / (4.0 * rs + 0.001), 0.15, 1.0);

        // --- RK4 step ---
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

        // New 3D position
        vec3 newPos = r * (cos(phi) * e1 + sin(phi) * e2);
        float newY  = newPos.y;

        // --- Check event horizon ---
        if (r <= rs && rs > 0.0) {
            // Disk emission already accumulated is composited over black
            terminated = true;
            break;
        }

        // --- Check accretion disk crossing (equatorial plane y=0) ---
        // Rays pass THROUGH the disk, accumulating emission each crossing
        if (u_showDisk == 1 && accumAlpha < 0.98) {
            if (prevY * newY < 0.0) {
                // Interpolate to find crossing point
                float tCross = abs(prevY) / (abs(prevY) + abs(newY) + 1.0e-10);
                vec3 crossPos = mix(prevPos, newPos, tCross);
                float crossR = length(crossPos);
                float crossY = mix(prevY, newY, tCross);

                // Sample disk with soft edges (no hard rInner/rOuter cutoff)
                if (crossR >= rInner - 0.5 * rs && crossR <= rOuter + rs) {
                    vec4 diskSample = accretionDiskSample(crossR, rs, crossPos, rayDir, crossY);

                    // Front-to-back alpha compositing
                    float a = diskSample.a * (1.0 - accumAlpha);
                    accumColor += diskSample.rgb * a;
                    accumAlpha += a;
                }
            }
        }

        // --- Check escape ---
        if (r > escapeR) {
            // Reconstruct 3D escape direction from velocity in orbital plane
            vec3 rhat   = cos(phi) * e1 + sin(phi) * e2;
            vec3 phihat = -sin(phi) * e1 + cos(phi) * e2;
            vec3 escapeDir = normalize(vr * rhat + r * vphi * phihat);

            // Gravitational redshift at escape point
            float redshift = sqrt(max(1.0 - rs / r, 0.0));
            vec3 starColor = sampleStarfield(escapeDir) * redshift;

            // Composite starfield behind accumulated disk emission
            accumColor += starColor * (1.0 - accumAlpha);
            accumAlpha = 1.0;
            terminated = true;
            break;
        }
    }

    // Rays that neither escaped nor hit anything: treat as absorbed
    // Accumulated disk emission composited over black background
    vec3 color = accumColor;

    // ----- 5. Tone mapping: Reinhard -----
    color = color / (1.0 + color);

    // ----- 6. Gamma correction -----
    color = pow(color, vec3(1.0 / 2.2));

    fragColor = vec4(color, 1.0);
}
