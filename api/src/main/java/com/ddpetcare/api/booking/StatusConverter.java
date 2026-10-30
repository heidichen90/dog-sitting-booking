package com.ddpetcare.api.booking;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

@Converter
public class StatusConverter implements AttributeConverter<Status, String> {

    @Override
    public String convertToDatabaseColumn(Status status) {
        return status.dbValue();
    }

    @Override
    public Status convertToEntityAttribute(String value) {
        return Status.fromDbValue(value);
    }
}
