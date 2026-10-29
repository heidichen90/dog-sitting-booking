package com.ddpetcare.api.schema;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.sql.SQLException;

import com.ddpetcare.api.DatabaseTest;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.DuplicateKeyException;

class ClientsAndDogsSchemaTest extends DatabaseTest {

    @Test
    void generatesClientIds() {
        long first = insertClient("Sarah", null);
        long second = insertClient("Tom", null);

        assertThat(second).isGreaterThan(first);
    }

    @Test
    void rejectsExplicitClientId() {
        assertThatThrownBy(() -> jdbc.sql("INSERT INTO clients (id, name) VALUES (999, 'Sarah')").update())
                .isInstanceOf(DataAccessException.class)
                .rootCause()
                .isInstanceOfSatisfying(SQLException.class, e -> assertThat(e.getSQLState()).isEqualTo("428C9"));
    }

    @Test
    void rejectsBlankClientName() {
        assertThatThrownBy(() -> insertClient("   ", null))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("clients_name_not_blank_check");
    }

    @Test
    void rejectsPhoneNotInInternationalFormat() {
        assertThatThrownBy(() -> insertClient("Sarah", "07700900001"))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("clients_phone_e164_check");
    }

    @Test
    void rejectsBlankPhone() {
        assertThatThrownBy(() -> insertClient("Sarah", ""))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("clients_phone_e164_check");
    }

    @Test
    void allowsManyClientsWithoutPhone() {
        insertClient("Sarah", null);
        insertClient("Tom", null);
    }

    @Test
    void rejectsDuplicatePhone() {
        insertClient("Sarah", "+447700900001");

        assertThatThrownBy(() -> insertClient("Tom", "+447700900001"))
                .isInstanceOf(DuplicateKeyException.class)
                .hasMessageContaining("clients_phone_key");
    }

    @Test
    void rejectsDogForMissingClient() {
        assertThatThrownBy(() -> insertDog(-1L, "Bella"))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("dogs_client_id_fkey");
    }

    @Test
    void rejectsBlankDogName() {
        long sarah = insertClient("Sarah", null);

        assertThatThrownBy(() -> insertDog(sarah, ""))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("dogs_name_not_blank_check");
    }

    @Test
    void rejectsDuplicateDogNameForSameClient() {
        long sarah = insertClient("Sarah", null);
        insertDog(sarah, "Bella");

        assertThatThrownBy(() -> insertDog(sarah, "Bella"))
                .isInstanceOf(DuplicateKeyException.class)
                .hasMessageContaining("dogs_client_id_lower_name_key");
    }

    @Test
    void rejectsDuplicateDogNameIgnoringCaseAndSpaces() {
        long sarah = insertClient("Sarah", null);
        insertDog(sarah, "Bella");

        assertThatThrownBy(() -> insertDog(sarah, " bella "))
                .isInstanceOf(DuplicateKeyException.class)
                .hasMessageContaining("dogs_client_id_lower_name_key");
    }

    @Test
    void allowsSameDogNameForDifferentClients() {
        insertDog(insertClient("Sarah", null), "Bella");
        insertDog(insertClient("Tom", null), "Bella");
    }

    @Test
    void rejectsDeletingClientWithDogs() {
        long sarah = insertClient("Sarah", null);
        insertDog(sarah, "Bella");

        assertThatThrownBy(() -> jdbc.sql("DELETE FROM clients WHERE id = ?").param(sarah).update())
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("dogs_client_id_fkey");
    }
}
