package com.ddpetcare.api.booking;

import java.util.Arrays;

public enum Status {
    CONFIRMED("confirmed"),
    CANCELLED("cancelled");

    private final String dbValue;

    Status(String dbValue) {
        this.dbValue = dbValue;
    }

    public String dbValue() {
        return dbValue;
    }

    static Status fromDbValue(String value) {
        return Arrays.stream(values())
                .filter(s -> s.dbValue.equals(value))
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("Unknown status: " + value));
    }
}
