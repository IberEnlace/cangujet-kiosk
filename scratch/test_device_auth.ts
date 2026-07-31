import { OrderDomainService, OrderDomainFailure } from "../src/server/services/orderDomainService.js";
import type { OrderActor } from "../src/server/repositories/orderRepository.js";

async function main() {
  const dummyRepo: any = {
    listActiveOrders: async (actor: any, audience: any) => {
      console.log(`Repository listActiveOrders called with role=${actor.role}, deviceType=${actor.deviceType}, audience=${audience}`);
      return [{ id: "order-1", status: "submitted" }];
    }
  };

  const service = new OrderDomainService(dummyRepo, null as any);

  const kitchenDeviceActor: OrderActor = {
    actorType: "device",
    actorId: "dev-kitchen-1",
    restaurantId: "rest-1",
    branchId: "branch-1",
    deviceId: "dev-kitchen-1",
    role: "device",
    deviceType: "kitchen_display"
  };

  console.log("Testing kitchen device actor accessing 'kitchen' audience:");
  try {
    const res = await service.active(kitchenDeviceActor, "kitchen");
    console.log("SUCCESS! Returned orders:", res);
  } catch (err: any) {
    console.error("ERROR:", err.code, err.message);
  }
}

main().catch(console.error);
