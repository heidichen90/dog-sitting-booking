package com.ddpetcare.api.error;

public class LoginThrottledException extends RuntimeException {

    public LoginThrottledException() {
        super("Too many failed logins");
    }
}
