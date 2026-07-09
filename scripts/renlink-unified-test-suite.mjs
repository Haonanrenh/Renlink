import { createTestContext, runWithContext } from '../tests/support/test-harness.mjs';
import { run as runRepositoryHygieneTests } from '../tests/repository-hygiene.test.mjs';
import { run as runFrontendContractTests } from '../frontend/tests/white-box/frontend-contracts.test.mjs';
import { run as runSignLearningDataTests } from '../frontend/tests/white-box/sign-learning-data.test.mjs';
import { run as runBackendContractTests } from '../backend/tests/white-box/backend-contracts.test.mjs';
import { run as runBackendApiTests } from '../backend/tests/black-box/api.test.mjs';
import { run as runAuthFlowTests } from '../backend/tests/black-box/auth-flow.test.mjs';
import { run as runFriendRequestTests } from '../backend/tests/black-box/friend-requests.test.mjs';
import { run as runMessageTests } from '../backend/tests/black-box/messages.test.mjs';
import { run as runAuxiliaryServiceTests } from '../backend/tests/black-box/auxiliary-services.test.mjs';
import { run as runCallInvitationIntegrationTests } from '../tests/integration/call-invitations.test.mjs';
import { run as runSignLearningE2eTests } from '../tests/e2e/sign-learning-ui.spec.mjs';
import { run as runFriendsChatE2eTests } from '../tests/e2e/friends-chat-ui.spec.mjs';
import { run as runSingleDeviceCallE2eTests } from '../tests/e2e/call-interface-single-device.spec.mjs';

const ctx = createTestContext();

await runWithContext(ctx, async () => {
    await runRepositoryHygieneTests(ctx);
    await runFrontendContractTests(ctx);
    await runSignLearningDataTests(ctx);
    await runBackendContractTests(ctx);
    await runBackendApiTests(ctx);
    await runAuthFlowTests(ctx);
    await runFriendRequestTests(ctx);
    await runMessageTests(ctx);
    await runAuxiliaryServiceTests(ctx);
    await runCallInvitationIntegrationTests(ctx);
    await runSignLearningE2eTests(ctx);
    await runFriendsChatE2eTests(ctx);
    await runSingleDeviceCallE2eTests(ctx);
});
