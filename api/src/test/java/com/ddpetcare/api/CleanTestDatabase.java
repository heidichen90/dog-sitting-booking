package com.ddpetcare.api;

import java.sql.Connection;
import java.sql.SQLException;

import org.springframework.boot.flyway.autoconfigure.FlywayMigrationStrategy;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;

@TestConfiguration
class CleanTestDatabase {

    @Bean
    FlywayMigrationStrategy cleanThenMigrate() {
        return flyway -> {
            // clean() drops everything in the schema; never let a misconfigured profile aim it at dev or prod.
            try (Connection connection = flyway.getConfiguration().getDataSource().getConnection()) {
                String database = connection.getCatalog();
                if (!database.endsWith("_test")) {
                    throw new IllegalStateException("Refusing to clean a non-test database: " + database);
                }
            } catch (SQLException e) {
                throw new IllegalStateException(e);
            }
            flyway.clean();
            flyway.migrate();
        };
    }
}
