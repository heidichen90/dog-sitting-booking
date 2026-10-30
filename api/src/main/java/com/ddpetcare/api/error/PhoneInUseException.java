package com.ddpetcare.api.error;

public class PhoneInUseException extends RuntimeException {

    private final long clientId;
    private final String clientName;

    public PhoneInUseException(long clientId, String clientName) {
        super("This phone number already belongs to " + clientName + ". Book for that client instead.");
        this.clientId = clientId;
        this.clientName = clientName;
    }

    public long getClientId() {
        return clientId;
    }

    public String getClientName() {
        return clientName;
    }
}
