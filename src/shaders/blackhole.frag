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
uniform float u_spin;
uniform float u_time;
uniform int   u_maxSteps;
uniform float u_stepSize;
uniform int   u_showDisk;
uniform int   u_showGrid;
uniform int   u_showDoppler;
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

    // Keplerian differential rotation: omega ∝ r^(-3/2)
    // Inner disk rotates MUCH faster — visually dramatic shearing
    float omega = pow(max(r / rInner, 1.0), -1.5);
    float rotatedAngle = angle - u_time * omega * 1.8;

    // Single broad logarithmic spiral (2 arms) — no competing frequencies
    float logR = log(r / rInner + 1.0);
    float spiral = sin(2.0 * rotatedAngle - 4.0 * logR) * 0.5 + 0.5;
    spiral = smoothstep(0.15, 0.85, spiral);

    // Turbulent flow via noise — carried by rotation for visible flow
    vec2 noiseCoord = vec2(rotatedAngle * 2.0, logR * 4.0 - u_time * 0.15);
    float turb = fbm(noiseCoord, 3);

    // Combine: spiral dominant for visible flow, noise adds organic texture
    float structure = mix(0.4, 1.0, spiral * 0.5 + turb * 0.4 + 0.1);

    // Bright hot spots — large discrete blobs orbiting at Keplerian speed
    float spot1 = smoothstep(0.6, 0.1, abs(mod(rotatedAngle, TWO_PI) - 1.0))
                * smoothstep(0.4, 0.0, abs(t - 0.1));
    float spot2 = smoothstep(0.5, 0.1, abs(mod(rotatedAngle + 2.5, TWO_PI) - 1.5))
                * smoothstep(0.4, 0.0, abs(t - 0.2));
    float spot3 = smoothstep(0.4, 0.1, abs(mod(rotatedAngle + 4.5, TWO_PI) - 2.8))
                * smoothstep(0.5, 0.0, abs(t - 0.05));

    // Smaller turbulent clumps
    float clumps = noise2D(vec2(rotatedAngle * 3.0, r / rs * 2.0));
    clumps = smoothstep(0.6, 0.95, clumps) * (1.0 - t) * 0.4;
    clumps += (spot1 + spot2 + spot3) * 0.7;

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
    float intensity = x * x * x * 18.0;
    // ISCO glow — bright inner ring
    float iscoGlow = exp(-((r - rInner) / (0.4 * rs)) * ((r - rInner) / (0.4 * rs)));
    intensity += iscoGlow * 6.0;
    // Hot spot boost
    intensity += clumps * 8.0;

    // --- Gravitational redshift: sqrt(1 - rs/r) ---
    float redshift = sqrt(max(1.0 - rs / r, 0.0));

    // --- Relativistic Doppler beaming from Keplerian orbital motion ---
    //
    // GR-corrected orbital velocity in Schwarzschild:
    //   v = sqrt(M/r) / sqrt(1 - 3M/r)
    // At ISCO (r=6M): v ≈ 0.577c
    // Diverges at photon sphere r=3M; capped for stability
    float rFactor = max(1.0 - 1.5 * rs / r, 0.02);
    float beta = min(sqrt(max(u_mass / r, 0.0)) / sqrt(rFactor), 0.95);
    float gamma = 1.0 / sqrt(max(1.0 - beta * beta, 0.01));

    // Disk velocity direction (prograde, tangential in equatorial plane)
    vec3 diskRadial = normalize(vec3(hitPos.x, 0.0, hitPos.z));
    vec3 diskVel = normalize(cross(diskRadial, vec3(0.0, 1.0, 0.0)));

    // The Doppler shift depends on the emitter velocity projected onto
    // the direction TO THE OBSERVER — not the local ray direction at the
    // crossing point (which is nearly perpendicular to the disk, giving ~0).
    //
    // For photons escaping to infinity, the asymptotic direction ≈ toward camera.
    // This gives the correct left-right brightness asymmetry:
    //   approaching side (v · toObs > 0) → blueshifted, brighter
    //   receding side    (v · toObs < 0) → redshifted,  dimmer
    vec3 toObserver = normalize(u_cameraPos - hitPos);
    float cosTheta = dot(toObserver, diskVel);

    // Relativistic Doppler factor: D = 1 / (γ(1 - β·cosθ))
    float D = 1.0 / (gamma * (1.0 - beta * cosTheta));

    // Thermal beaming: I_obs = D⁴ · I_emit (blackbody, Liouville's theorem)
    float doppler = D * D * D * D;

    // Doppler color temperature shift
    vec3 dopplerColor = baseColor;
    if (D > 1.0) {
        // Blueshifted (approaching): shift toward blue-white
        dopplerColor = mix(baseColor, vec3(0.7, 0.85, 1.4), clamp((D - 1.0) * 0.5, 0.0, 0.8));
    } else {
        // Redshifted (receding): shift toward deep red
        dopplerColor = mix(baseColor, vec3(1.4, 0.25, 0.02), clamp((1.0 - D) * 0.6, 0.0, 0.8));
    }

    // Apply Doppler beaming conditionally
    vec3 finalEmission = (u_showDoppler == 1) ? dopplerColor : baseColor;
    float finalDoppler = (u_showDoppler == 1) ? doppler : 1.0;

    vec3 finalColor = finalEmission * intensity * redshift * finalDoppler * structure;

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

// ============================================================
// Geodesic equations derived from the Schwarzschild metric:
//   ds² = -(1-rs/r)dt² + (1-rs/r)⁻¹dr² + r²dΩ²
//
// For null geodesics (ds²=0), using the Euler-Lagrange equations
// with conserved quantities E = (1-rs/r)dt/dλ, L = r²dφ/dλ:
//
//   d²r/dλ²  = L²/r³ - (3rs/2)·L²/r⁴
//             = r·vphi² - (3rs/2)·vphi²
//             = (r - 3M)·vphi²
//
//   d²φ/dλ²  = -(2/r)·vr·vphi  (angular momentum conservation)
//
// The (3rs/2)·vphi² term is the GR correction (a_GR) that:
//   - Fixes the photon sphere at r = 3M (independent of L)
//   - Gives the correct Einstein deflection angle (2x Newtonian)
//   - Derives from the -3GM·h²/(c²·r⁴) effective potential term
//
// state = (r, φ, dr/dλ, dφ/dλ)
// Returns derivatives: (dr/dλ, dφ/dλ, d²r/dλ², d²φ/dλ²)
// ============================================================

vec4 geodesicDerivs(vec4 state, float rs, float a) {
    float r    = max(state.x, 0.001); // guard against singularity
    float vr   = state.z;
    float vphi = state.w;

    // Schwarzschild null geodesic (exact, from metric):
    //   d²r/dλ² = (r - 1.5·rs)·vphi²
    //   d²φ/dλ² = -(2/r)·vr·vphi
    float d2r   = (r - 1.5 * rs) * vphi * vphi;
    float d2phi = -(2.0 / r) * vr * vphi;

    // Kerr frame-dragging corrections (equatorial approximation)
    // At a=0 these vanish, recovering Schwarzschild exactly
    float r3 = r * r * r;
    d2r   += -a * a * rs / (2.0 * r3) + a * rs * vphi / (r * r);
    d2phi += a * rs * vr / r3;

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
    float a  = u_spin * u_mass; // dimensional Kerr spin parameter

    // Kerr event horizon: r_+ = M + sqrt(M² - a²)
    float r_eh = u_mass + sqrt(max(u_mass * u_mass - a * a, 0.0));

    // Graceful fallback: camera inside event horizon
    if (r0 <= r_eh && rs > 0.0) {
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

    // Kerr ISCO (prograde, equatorial approximation)
    float kerrA = min(abs(u_spin), 0.9999);
    float z1k = 1.0 + pow(1.0 - kerrA * kerrA, 1.0/3.0) * (pow(1.0 + kerrA, 1.0/3.0) + pow(max(1.0 - kerrA, 0.0), 1.0/3.0));
    float z2k = sqrt(3.0 * kerrA * kerrA + z1k * z1k);
    float r_isco_kerr = u_mass * (3.0 + z2k - sqrt((3.0 - z1k) * (3.0 + z1k + 2.0 * z2k)));

    float rInner  = max(r_isco_kerr, r_eh) * 2.0 / rs; // convert to ratio then back
    rInner = max(r_isco_kerr, r_eh + 0.01); // Kerr ISCO or just outside horizon
    float rOuter  = DISK_OUTER_RATIO * rs;
    float escapeR = max(MIN_ESCAPE, r0 * ESCAPE_MULT);
    float h       = u_stepSize;

    vec3 accumColor = vec3(0.0);
    float accumAlpha = 0.0;
    bool terminated = false;

    // Phase 2: photon ring tracking
    float totalAngle = 0.0;
    float prevPhi = phi;
    int diskCrossings = 0;

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

        vec4 k1 = adaptH * geodesicDerivs(state, rs, a);
        vec4 k2 = adaptH * geodesicDerivs(state + k1 * 0.5, rs, a);
        vec4 k3 = adaptH * geodesicDerivs(state + k2 * 0.5, rs, a);
        vec4 k4 = adaptH * geodesicDerivs(state + k3, rs, a);

        state += (k1 + 2.0 * k2 + 2.0 * k3 + k4) / 6.0;

        r    = state.x;
        phi  = state.y;
        vr   = state.z;
        vphi = state.w;

        // Track cumulative angular traversal for photon ring detection
        totalAngle += abs(phi - prevPhi);
        prevPhi = phi;

        // New 3D position
        vec3 newPos = r * (cos(phi) * e1 + sin(phi) * e2);
        float newY  = newPos.y;

        // --- Check event horizon (Kerr) ---
        if (r <= r_eh && rs > 0.0) {
            terminated = true;
            break;
        }

        // --- Check accretion disk crossing (equatorial plane y=0) ---
        if (u_showDisk == 1 && accumAlpha < 0.98) {
            if (prevY * newY < 0.0) {
                diskCrossings++;
                // Interpolate to find crossing point
                float tCross = abs(prevY) / (abs(prevY) + abs(newY) + 1.0e-10);
                vec3 crossPos = mix(prevPos, newPos, tCross);
                float crossR = length(crossPos);
                float crossY = mix(prevY, newY, tCross);

                // Sample disk with soft edges
                if (crossR >= rInner - 0.5 * rs && crossR <= rOuter + rs) {
                    vec4 diskSample = accretionDiskSample(crossR, rs, crossPos, rayDir, crossY);

                    // Higher-order crossings get brightness boost (photon ring effect)
                    float crossingBoost = 1.0 + float(max(diskCrossings - 1, 0)) * 0.3;
                    diskSample.rgb *= crossingBoost;

                    // Front-to-back alpha compositing
                    float ca = diskSample.a * (1.0 - accumAlpha);
                    accumColor += diskSample.rgb * ca;
                    accumAlpha += ca;
                }
            }
        }

        // --- Check escape ---
        if (r > escapeR) {
            vec3 rhat   = cos(phi) * e1 + sin(phi) * e2;
            vec3 phihat = -sin(phi) * e1 + cos(phi) * e2;
            vec3 escapeDir = normalize(vr * rhat + r * vphi * phihat);

            float redshift = sqrt(max(1.0 - rs / r, 0.0));
            vec3 starColor = sampleStarfield(escapeDir) * redshift;

            // Photon ring glow: rays that nearly orbited get warm glow
            if (totalAngle > TWO_PI) {
                float ringGlow = smoothstep(TWO_PI, TWO_PI * 2.0, totalAngle) * 0.4;
                starColor += vec3(1.0, 0.8, 0.5) * ringGlow;
            }

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
