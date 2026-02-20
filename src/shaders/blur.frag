#version 300 es
// blur.frag — 9-tap separable Gaussian blur
precision highp float;

uniform sampler2D u_image;
uniform vec2 u_direction; // (1/w, 0) for horizontal, (0, 1/h) for vertical

in vec2 v_uv;
out vec4 fragColor;

void main() {
    // 9-tap Gaussian weights (sigma ≈ 4)
    float weights[5] = float[](0.2270270270, 0.1945945946, 0.1216216216, 0.0540540541, 0.0162162162);

    vec3 result = texture(u_image, v_uv).rgb * weights[0];

    for (int i = 1; i < 5; i++) {
        vec2 offset = u_direction * float(i);
        result += texture(u_image, v_uv + offset).rgb * weights[i];
        result += texture(u_image, v_uv - offset).rgb * weights[i];
    }

    fragColor = vec4(result, 1.0);
}
