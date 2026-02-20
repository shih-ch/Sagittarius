#version 300 es
// fullscreen.vert — Fullscreen quad vertex shader
// Sagittarius Black Hole Simulation

layout(location = 0) in vec2 a_position; // [-1, 1] quad corners
out vec2 v_uv;                           // [0, 1] texture coords

void main() {
    v_uv = a_position * 0.5 + 0.5;
    gl_Position = vec4(a_position, 0.0, 1.0);
}
