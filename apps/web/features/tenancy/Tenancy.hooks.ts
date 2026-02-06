import { useEffect, useState } from "react";
import { SPACE_SELECTION_KEY } from "@saturn/sdk/client";
import { useQuery } from "@/lib/react-query";
import { listSpaces } from "@saturn/gen/saturn/tenancy/v1/tenancy.client";
import { Space_View } from "@saturn/gen/saturn/tenancy/v1/tenancy_pb";
import { localStore } from "@saturn/sdk/localstorage";

export function useSpaceSelection() {
  const [currentSpaceId, setCurrentSpaceId] = useState(() => {
    return localStore.load(SPACE_SELECTION_KEY) ?? "";
  });

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === `saturn:${SPACE_SELECTION_KEY}`) {
        setCurrentSpaceId(e.newValue ?? "");
      }
    };

    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const setSpaceId = (spaceId: string) => {
    localStore.save(SPACE_SELECTION_KEY, spaceId);
    setCurrentSpaceId(spaceId);
  };

  return [currentSpaceId, setSpaceId] as const;
}

export function useSpaces() {
  return useQuery({
    queryKey: ["tenancy", "spaces", "list"],
    queryFn: () => listSpaces({ view: Space_View.BASIC }),
  });
}
