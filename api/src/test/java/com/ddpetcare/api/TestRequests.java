package com.ddpetcare.api;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.util.Map;

public final class TestRequests {

    private TestRequests() {
    }

    public static String load(String name) {
        return load(name, Map.of());
    }

    /** Loads src/test/resources/requests/{name} and replaces each {{key}} with its value. */
    public static String load(String name, Map<String, Object> values) {
        try (InputStream in = TestRequests.class.getResourceAsStream("/requests/" + name)) {
            if (in == null) {
                throw new IllegalArgumentException("No request file: " + name);
            }
            String json = new String(in.readAllBytes(), StandardCharsets.UTF_8);
            for (Map.Entry<String, Object> entry : values.entrySet()) {
                json = json.replace("{{" + entry.getKey() + "}}", String.valueOf(entry.getValue()));
            }
            if (json.contains("{{")) {
                throw new IllegalArgumentException("Unfilled placeholder in " + name);
            }
            return json;
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }
}
