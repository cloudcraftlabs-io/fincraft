import { pull } from "lodash-es";
import { RouteLocationNormalized, RouteRecordRaw } from "vue-router";
import ProjectSidebarV1 from "@/components/Project/ProjectSidebarV1.vue";
import DatabaseLayout from "@/layouts/DatabaseLayout.vue";
import { t } from "@/plugins/i18n";
import { hasFeature, useDatabaseV1Store } from "@/store";
import { QuickActionType } from "@/types";
import { idFromSlug } from "@/utils";
import DashboardSidebar from "@/views/DashboardSidebar.vue";

export const DATABASE_ROUTE_DASHBOARD = "workspace.database";
export const DATABASE_ROUTE_DETAIL = `${DATABASE_ROUTE_DASHBOARD}.detail`;

const databaseRoutes: RouteRecordRaw[] = [
  {
    path: "db",
    name: DATABASE_ROUTE_DASHBOARD,
    meta: {
      title: () => t("common.databases"),
      quickActionListByRole: () => {
        const DBA_AND_OWNER_QUICK_ACTION_LIST: QuickActionType[] = [
          "quickaction.bb.database.create",
        ];
        const DEVELOPER_QUICK_ACTION_LIST: QuickActionType[] = [
          "quickaction.bb.database.create",
          "quickaction.bb.issue.grant.request.querier",
          "quickaction.bb.issue.grant.request.exporter",
        ];

        if (hasFeature("bb.feature.dba-workflow")) {
          pull(DEVELOPER_QUICK_ACTION_LIST, "quickaction.bb.database.create");
        }

        return new Map([
          ["OWNER", DBA_AND_OWNER_QUICK_ACTION_LIST],
          ["DBA", DBA_AND_OWNER_QUICK_ACTION_LIST],
          ["DEVELOPER", DEVELOPER_QUICK_ACTION_LIST],
        ]);
      },
    },
    components: {
      content: () => import("@/views/DatabaseDashboard.vue"),
      leftSidebar: DashboardSidebar,
    },
    props: { content: true, leftSidebar: true },
  },
  {
    path: "db/:databaseSlug",
    components: {
      content: DatabaseLayout,
      leftSidebar: ProjectSidebarV1,
    },
    props: { content: true, leftSidebar: true },
    children: [
      {
        path: "",
        name: DATABASE_ROUTE_DETAIL,
        meta: {
          title: (route: RouteLocationNormalized) => {
            const slug = route.params.databaseSlug as string;
            if (slug.toLowerCase() == "new") {
              return t("common.new");
            }
            return useDatabaseV1Store().getDatabaseByUID(
              String(idFromSlug(slug))
            ).databaseName;
          },
        },
        component: () => import("@/views/DatabaseDetail.vue"),
        props: true,
      },
    ],
  },
];

export default databaseRoutes;
