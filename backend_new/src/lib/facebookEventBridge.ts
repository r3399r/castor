import { DisableRuleCommand, EnableRuleCommand, EventBridgeClient } from '@aws-sdk/client-eventbridge';

// Matches the legacy backend's FacebookService.ruleName -- same rule,
// same naming convention, so this can enable/disable the exact rule the
// CloudFormation template provisions.
const ruleName = () => `${process.env.PROJECT}-${process.env.ENVR}-facebook`;

/**
 * Arms the polling rule so it starts picking off newly-created questions
 * -- called after a question is created. Best-effort: a transient
 * EventBridge API failure here shouldn't fail question creation, it just
 * means the next successful creation gets another chance to arm it.
 *
 * Deliberately its own module, separate from the actual posting logic in
 * facebookPoster.ts -- that module pulls in puppeteer-core for rendering
 * question images, which the (otherwise lightweight) API function that
 * calls this on every question creation has no other reason to bundle.
 */
export const enableFacebookEventBridge = async (): Promise<void> => {
  try {
    const eb = new EventBridgeClient({});
    await eb.send(new EnableRuleCommand({ Name: ruleName() }));
  } catch (error) {
    console.error('Failed to enable Facebook EventBridge rule', error);
  }
};

export const disableFacebookEventBridge = async (): Promise<void> => {
  const eb = new EventBridgeClient({});
  await eb.send(new DisableRuleCommand({ Name: ruleName() }));
};
