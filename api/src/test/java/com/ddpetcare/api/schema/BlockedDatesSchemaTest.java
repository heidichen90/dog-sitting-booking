package com.ddpetcare.api.schema;

import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.LocalDate;

import com.ddpetcare.api.DatabaseTest;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;

class BlockedDatesSchemaTest extends DatabaseTest {

    private static final LocalDate START = LocalDate.of(2027, 8, 1);

    @Test
    void acceptsRangeWithReason() {
        insertBlocked(START, START.plusDays(13), "Holiday");
    }

    @Test
    void acceptsSingleDayWithoutReason() {
        insertBlocked(START, START, null);
    }

    @Test
    void rejectsEndBeforeStart() {
        assertThatThrownBy(() -> insertBlocked(START, START.minusDays(1), null))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("blocked_dates_range_check");
    }

    private void insertBlocked(LocalDate start, LocalDate end, String reason) {
        jdbc.sql("INSERT INTO blocked_dates (start_date, end_date, reason) VALUES (?, ?, ?)")
                .params(start, end, reason)
                .update();
    }
}
