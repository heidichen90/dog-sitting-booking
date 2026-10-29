package com.ddpetcare.api;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class TestDatabaseConnectionTest extends DatabaseTest {

    @Test
    void connectsToTheTestDatabase() {
        String database = jdbc.sql("SELECT current_database()").query(String.class).single();

        assertThat(database).isEqualTo("dd_pet_care_test");
    }
}
