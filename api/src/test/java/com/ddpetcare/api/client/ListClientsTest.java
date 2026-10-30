package com.ddpetcare.api.client;

import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.ddpetcare.api.DatabaseTest;
import org.junit.jupiter.api.Test;

class ListClientsTest extends DatabaseTest {

    @Test
    void listsClientsByNameWithTheirDogs() throws Exception {
        long zoe = insertClient("Zoe Hart", "+447700900111");
        insertDog(zoe, "Rex");
        insertDog(zoe, "Ace");
        insertClient("Amy Pond", null);

        getJson("/clients")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].name").value("Amy Pond"))
                .andExpect(jsonPath("$[0].phone").value(nullValue()))
                .andExpect(jsonPath("$[0].dogs.length()").value(0))
                .andExpect(jsonPath("$[1].id").value(zoe))
                .andExpect(jsonPath("$[1].phone").value("+447700900111"))
                .andExpect(jsonPath("$[1].dogs[0].name").value("Ace"))
                .andExpect(jsonPath("$[1].dogs[1].name").value("Rex"));
    }

    @Test
    void returnsEmptyListWhenNoClients() throws Exception {
        getJson("/clients")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }
}
