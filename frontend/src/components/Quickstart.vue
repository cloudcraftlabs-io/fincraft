<template>
  <div
    v-if="showQuickstart"
    class="py-2 px-4 w-full flex-shrink-0 border-t border-block-border hidden lg:block bg-yellow-50"
  >
    <p
      class="text-sm font-medium text-gray-900 flex items-center justify-between"
    >
      <span
        >🎈 {{ $t("quick-start.self") }} - {{ $t("quick-start.guide") }}</span
      >

      <button class="btn-icon" @click.prevent="() => hideQuickstart()">
        <heroicons-solid:x class="w-4 h-4" />
      </button>
    </p>
    <div class="mt-2" aria-hidden="true">
      <div class="overflow-hidden rounded-full bg-gray-200">
        <div
          class="h-2 rounded-full bg-indigo-600"
          :style="{ width: percent }"
        />
      </div>
      <div
        class="mt-2 hidden grid-cols-4 text-sm font-medium text-gray-600 sm:grid"
        :style="{
          gridTemplateColumns: `repeat(${introList.length}, minmax(0, 1fr))`,
        }"
      >
        <component
          :is="intro.link ? 'router-link' : 'div'"
          v-for="(intro, index) in introList"
          :key="index"
          :to="intro.link"
          active-class=""
          exact-active-class=""
          class="group cursor-pointer flex items-center gap-x-1 text-sm font-medium"
          :class="[
            index === 0 && 'justify-start',
            index > 0 && index < introList.length - 1 && 'justify-center',
            index === introList.length - 1 && 'justify-end',
            isTaskActive(index)
              ? 'text-indigo-600'
              : 'text-control-light group-hover:text-control-light-hover',
            unref(intro.done) && 'line-through',
          ]"
          @click="intro.click"
        >
          <span
            class="relative h-5 w-5 inline-flex items-center justify-center"
          >
            <template v-if="intro.done.value">
              <!-- Heroicon name: solid/check-circle -->
              <heroicons-solid:check-circle
                class="h-full w-full text-success group-hover:text-success-hover"
              />
            </template>
            <template v-else-if="isTaskActive(index)">
              <span class="relative flex h-3 w-3">
                <span
                  class="absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"
                  style="animation: ping 2s cubic-bezier(0, 0, 0.2, 1) infinite"
                ></span>
                <span
                  class="relative inline-flex rounded-full h-3 w-3 bg-indigo-500"
                ></span>
              </span>
            </template>
            <template v-else>
              <div
                class="h-2 w-2 bg-gray-300 rounded-full group-hover:bg-gray-400"
              ></div>
            </template>
          </span>
          <span class="inline-flex">
            {{ unref(intro.name) }}
          </span>
        </component>
      </div>
    </div>
  </div>
  <div
    v-if="showBookDemo"
    class="bg-accent px-4 py-2 flex flex-wrap md:flex-nowrap items-center justify-center space-x-2"
  >
    <p class="ml-3 flex font-medium text-white items-center truncate">
      📆
      <a
        href="https://cal.com/bytebase/product-walkthrough"
        target="_blank"
        class="flex underline ml-1"
      >
        {{ $t("banner.request-demo") }}
      </a>
    </p>

    <div class="shrink-0 flex items-center gap-x-2">
      <button
        type="button"
        class="flex rounded-md hover:bg-accent-hover focus:outline-none focus:ring-2 focus:ring-white"
        @click.prevent="() => hideQuickstart()"
      >
        <span class="sr-only">{{ $t("common.dismiss") }}</span>
        <!-- Heroicon name: outline/x -->
        <heroicons-outline:x class="h-4 w-4 text-white" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useKBarHandler, useKBarEventOnce } from "@bytebase/vue-kbar";
import { computed, unref, Ref } from "vue";
import { useI18n } from "vue-i18n";
import { pushNotification, useCurrentUserV1, useUIStateStore } from "@/store";
import { hasWorkspacePermissionV1, hasWorkspacePermissionV2 } from "@/utils";

type IntroItem = {
  name: string | Ref<string>;
  link: string;
  done: Ref<boolean>;
  click?: () => void;
};

const uiStateStore = useUIStateStore();
const { t } = useI18n();
const kbarHandler = useKBarHandler();

const currentUserV1 = useCurrentUserV1();

const show = computed(() => {
  return !uiStateStore.getIntroStateByKey("hidden");
});

const introList = computed(() => {
  const introList: IntroItem[] = [
    {
      name: computed(() =>
        t("quick-start.use-kbar", {
          shortcut: `${navigator.platform.match(/mac/i) ? "cmd" : "ctrl"}-k`,
        })
      ),
      link: "",
      click: () => {
        kbarHandler.value.show();
      },
      done: computed(() => uiStateStore.getIntroStateByKey("kbar.open")),
    },
    {
      name: computed(() => t("quick-start.view-an-issue")),
      link: "/issue/101",
      done: computed(() => uiStateStore.getIntroStateByKey("issue.visit")),
    },
    {
      name: computed(() => t("quick-start.query-data")),
      link: "/sql-editor/sheet/project-sample-101",
      done: computed(() => uiStateStore.getIntroStateByKey("data.query")),
    },
    {
      name: computed(() => t("quick-start.visit-project")),
      link: "/project",
      done: computed(() => uiStateStore.getIntroStateByKey("project.visit")),
    },
  ];

  if (hasWorkspacePermissionV2(currentUserV1.value, "bb.environments.create")) {
    introList.push({
      name: computed(() => t("quick-start.visit-environment")),
      link: "/environment",
      done: computed(() =>
        uiStateStore.getIntroStateByKey("environment.visit")
      ),
    });
  }

  if (
    hasWorkspacePermissionV1(
      "bb.permission.workspace.manage-instance",
      currentUserV1.value.userRole
    )
  ) {
    introList.push({
      name: computed(() => t("quick-start.visit-instance")),
      link: "/instance",
      done: computed(() => uiStateStore.getIntroStateByKey("instance.visit")),
    });
  }

  introList.push({
    name: computed(() => t("quick-start.visit-database")),
    link: "/db",
    done: computed(() => uiStateStore.getIntroStateByKey("database.visit")),
  });

  introList.push({
    name: computed(() => t("quick-start.visit-member")),
    link: "/setting/member",
    done: computed(() => uiStateStore.getIntroStateByKey("member.visit")),
  });

  return introList;
});

const showQuickstart = computed(() => {
  if (!show.value) return false;
  if (introList.value.every((intro) => intro.done.value)) return false;
  return true;
});

const showBookDemo = computed(() => {
  if (!show.value) return false;
  if (showQuickstart.value) return false;
  return true;
});

const currentStep = computed(() => {
  let i = 0;
  const list = introList.value;
  while (i < list.length && list[i].done.value) {
    i++;
  }
  return i;
});

const isTaskActive = (index: number): boolean => {
  for (let i = index - 1; i >= 0; i--) {
    if (!introList.value[i].done.value) {
      return false;
    }
  }
  return !introList.value[index].done.value;
};

const progress = computed(() => {
  return {
    current: currentStep.value,
    total: introList.value.length,
  };
});

const percent = computed(() => {
  const { current, total } = progress.value;
  if (current === 0) {
    return "3rem";
  }
  if (current === total - 1) {
    return "calc(100% - 3rem)";
  }

  const offset = 0.5;
  const unit = 100 / total;
  const percent = Math.min((current + offset) * unit, 100);
  return `${percent}%`;
});

const hideQuickstart = (silent = false) => {
  uiStateStore
    .saveIntroStateByKey({
      key: "hidden",
      newState: true,
    })
    .then(() => {
      if (!silent) {
        pushNotification({
          module: "bytebase",
          style: "INFO",
          title: t("quick-start.notice.title"),
          description: t("quick-start.notice.desc"),
          manualHide: true,
        });
      }
    });
};

useKBarEventOnce("open", () => {
  // once kbar is open, mark the quickstart as done
  uiStateStore.saveIntroStateByKey({
    key: "kbar.open",
    newState: true,
  });
});
</script>
