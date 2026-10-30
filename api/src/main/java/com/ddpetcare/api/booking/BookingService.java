package com.ddpetcare.api.booking;

import com.ddpetcare.api.booking.CreateBookingRequest.ClientRef;
import com.ddpetcare.api.booking.CreateBookingRequest.DogRef;
import com.ddpetcare.api.booking.CreateBookingRequest.StayRequest;
import com.ddpetcare.api.client.Client;
import com.ddpetcare.api.client.ClientRepository;
import com.ddpetcare.api.client.Dog;
import com.ddpetcare.api.client.DogRepository;
import com.ddpetcare.api.error.InvalidRequestException;
import com.ddpetcare.api.error.NotFoundException;
import com.ddpetcare.api.error.PhoneInUseException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class BookingService {

    private final BookingRepository bookings;
    private final ClientRepository clients;
    private final DogRepository dogs;

    public BookingService(BookingRepository bookings, ClientRepository clients, DogRepository dogs) {
        this.bookings = bookings;
        this.clients = clients;
        this.dogs = dogs;
    }

    @Transactional
    public BookingResponse create(CreateBookingRequest request) {
        Client client = resolveClient(request.client());
        Dog dog = resolveDog(client, request.dog());
        Booking booking = new Booking(client, dog, trimToNull(request.notes()));
        for (StayRequest stay : request.stays()) {
            booking.addStay(stay.dropOffDate(), stay.dropOffTime(), stay.pickUpDate(), stay.pickUpTime(),
                    stay.unitRate(), stay.pickupDropoffFee());
        }
        return BookingResponse.from(bookings.save(booking));
    }

    private Client resolveClient(ClientRef ref) {
        if (ref.id() != null) {
            return clients.findById(ref.id())
                    .orElseThrow(() -> new NotFoundException("Client " + ref.id() + " not found"));
        }
        if (ref.phone() != null) {
            clients.findByPhone(ref.phone()).ifPresent(existing -> {
                throw new PhoneInUseException(existing.getId(), existing.getName());
            });
        }
        return clients.save(new Client(ref.name().strip(), ref.phone()));
    }

    private Dog resolveDog(Client client, DogRef ref) {
        if (ref.id() != null) {
            Dog dog = dogs.findById(ref.id())
                    .orElseThrow(() -> new NotFoundException("Dog " + ref.id() + " not found"));
            if (!dog.getClient().getId().equals(client.getId())) {
                throw new InvalidRequestException(
                        "Dog " + dog.getId() + " does not belong to client " + client.getId());
            }
            return dog;
        }
        String name = ref.name().strip();
        return dogs.findByClientAndName(client, name).orElseGet(() -> dogs.save(new Dog(client, name)));
    }

    private static String trimToNull(String text) {
        return text == null || text.isBlank() ? null : text.strip();
    }
}
