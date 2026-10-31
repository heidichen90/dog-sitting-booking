package com.ddpetcare.api.auth;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

// BCrypt only reads the first 72 bytes; capped to bound the input.
public record LoginRequest(@NotBlank @Size(max = 100) String username, @NotBlank @Size(max = 72) String password) {
}
