<template>
  <router-link
    class="px-4 py-3 menu-item w-48"
    to="/setting/profile"
    role="menuitem"
  >
    <p class="text-sm flex justify-between space-x-2">
      <span class="text-main font-medium truncate text-ellipsis">
        {{ currentUserV1.title }}
      </span>
      <span class="text-control">
        {{ roleNameV1(currentUserV1.userRole) }}
      </span>
    </p>
    <p class="text-sm text-control truncate text-ellipsis">
      {{ currentUserV1.email }}
    </p>
  </router-link>
</template>

<script setup lang="ts">
import { useCurrentUserV1 } from "@/store";
import { roleNameV1 } from "@/utils";

const currentUserV1 = useCurrentUserV1();
</script>
