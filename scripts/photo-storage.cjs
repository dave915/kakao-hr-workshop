// Uses the existing Firebase CLI login without printing or storing access tokens.
const { getGlobalDefaultAccount } = require("firebase-tools/lib/auth");
const { requireAuth } = require("firebase-tools/lib/requireAuth");
const { Client } = require("firebase-tools/lib/apiv2");
const project = "kakao-hr-workshop-915";
const bucket = `${project}-photos`;
(async () => {
  await requireAuth({ project, ...getGlobalDefaultAccount() });
  const storage = new Client({
    urlPrefix: "https://storage.googleapis.com/storage",
    apiVersion: "v1",
  });
  const result = await storage.get("/b", { queryParams: { project } });
  let found = (result.body.items || []).find((b) => b.name === bucket);
  if (process.argv.includes("--verify")) {
    if (!found) throw new Error("Photo bucket is not provisioned.");
    const email = `workshop-runtime@${project}.iam.gserviceaccount.com`;
    const member = `serviceAccount:${email}`;
    const iam = new Client({
      urlPrefix: "https://iam.googleapis.com",
      apiVersion: "v1",
    });
    const functions = new Client({
      urlPrefix: "https://cloudfunctions.googleapis.com",
      apiVersion: "v2",
    });
    const [bucketPolicy, accountPolicy, deployed] = await Promise.all([
      storage.get(`/b/${bucket}/iam`),
      iam.post(
        `/projects/${project}/serviceAccounts/${email}:getIamPolicy`,
        {},
      ),
      functions.get(
        `/projects/${project}/locations/asia-northeast3/functions/photoBoardAction`,
      ),
    ]);
    const granted = (policy, role) =>
      (policy.bindings || []).some(
        (b) => b.role === role && b.members.includes(member),
      );
    const endpoint = await fetch(
      `https://asia-northeast3-${project}.cloudfunctions.net/photoBoardAction`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: { action: "list" } }),
      },
    );
    const checks = {
      active: deployed.body.state === "ACTIVE",
      correctRuntime:
        deployed.body.serviceConfig?.serviceAccountEmail === email,
      objectAccess: granted(bucketPolicy.body, "roles/storage.objectAdmin"),
      signingPermission: granted(
        accountPolicy.body,
        "roles/iam.serviceAccountTokenCreator",
      ),
      cors: found.cors?.some(
        (c) =>
          c.origin.includes("https://dave915.github.io") &&
          c.method.includes("GET"),
      ),
      private: found.iamConfiguration?.publicAccessPrevention === "enforced",
      freeTierRegion: found.location === "US-WEST1",
      anonymousDenied: endpoint.status === 401,
    };
    console.log(JSON.stringify(checks, null, 2));
    if (Object.values(checks).some((value) => value !== true))
      throw new Error("Photo infrastructure verification failed.");
  }
  if (process.argv.includes("--apply")) {
    await require("firebase-tools/lib/ensureApiEnabled").ensure(
      project,
      "firebasestorage.googleapis.com",
      "storage",
      false,
    );
    if (!found) {
      found = (
        await storage.post(
          "/b",
          {
            name: bucket,
            location: "US-WEST1",
            storageClass: "STANDARD",
            iamConfiguration: {
              uniformBucketLevelAccess: { enabled: true },
              publicAccessPrevention: "enforced",
            },
            softDeletePolicy: { retentionDurationSeconds: "0" },
            cors: [
              {
                origin: [
                  "https://dave915.github.io",
                  "http://127.0.0.1:4187",
                  "http://localhost:4187",
                ],
                method: ["GET", "HEAD", "POST", "PUT"],
                responseHeader: ["Content-Type", "Content-Length", "ETag"],
                maxAgeSeconds: 3600,
              },
            ],
            labels: { app: "hr-workshop", purpose: "participant-photos" },
          },
          { queryParams: { project } },
        )
      ).body;
      console.log("Created private US-WEST1 Standard photo bucket.");
    }
    if (found.location !== "US-WEST1")
      throw new Error(
        "Existing bucket is not in the expected free-tier region.",
      );
    const firebase = new Client({
      urlPrefix: "https://firebasestorage.googleapis.com",
      apiVersion: "v1beta",
    });
    try {
      await firebase.post(
        `/projects/${project}/buckets/${bucket}:addFirebase`,
        {},
      );
    } catch (e) {
      if (e.status !== 409 && e.context?.response?.statusCode !== 409) throw e;
    }
    const iam = (await storage.get(`/b/${bucket}/iam`)).body;
    const member = `serviceAccount:workshop-runtime@${project}.iam.gserviceaccount.com`;
    iam.bindings ||= [];
    const grant = iam.bindings.find(
      (b) => b.role === "roles/storage.objectAdmin" && !b.condition,
    );
    if (grant) {
      if (!grant.members.includes(member)) grant.members.push(member);
    } else
      iam.bindings.push({
        role: "roles/storage.objectAdmin",
        members: [member],
      });
    await storage.put(`/b/${bucket}/iam`, iam);
    await require("firebase-tools/lib/gcp/resourceManager").addServiceAccountToRoles(
      "195097906120",
      "service-195097906120@gcp-sa-firebasestorage.iam.gserviceaccount.com",
      ["roles/firebaserules.firestoreServiceAgent"],
      true,
    );
    console.log(
      "Linked private Firebase storage, enabled membership rules, and granted the existing workshop runtime object access.",
    );
  }
  console.log(
    JSON.stringify(
      found
        ? {
            name: found.name,
            location: found.location,
            storageClass: found.storageClass,
            publicAccessPrevention:
              found.iamConfiguration?.publicAccessPrevention,
          }
        : { photoBucket: "not provisioned" },
      null,
      2,
    ),
  );
})().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
