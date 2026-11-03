package com.ddpetcare.api.schema;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import com.ddpetcare.api.DatabaseTest;
import org.junit.jupiter.api.Test;

class SpringSessionSchemaTest extends DatabaseTest {

    private List<String> columns(String table) {
        return jdbc.sql("SELECT column_name FROM information_schema.columns WHERE table_name = ? ORDER BY ordinal_position")
                .param(table)
                .query(String.class)
                .list();
    }

    @Test
    void v2CreatesSpringSessionsTables() {
        assertThat(columns("spring_session")).containsExactly("primary_id", "session_id", "creation_time",
                "last_access_time", "max_inactive_interval", "expiry_time", "principal_name");
        assertThat(columns("spring_session_attributes"))
                .containsExactly("session_primary_id", "attribute_name", "attribute_bytes");
    }
}
