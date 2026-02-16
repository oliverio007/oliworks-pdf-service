import { parsePhraseToAction } from "../nlp/parsePhrase";

export async function handleChatCommand(params: {
  phrase: string;
  project: any;
  sendToApi: (payload: any) => Promise<any>;
}) {
  const { phrase, project, sendToApi } = params;

  const instruments = project.instruments || [];

  const parsed = parsePhraseToAction(phrase, instruments);

  if (!parsed) {
    return { understood: false };
  }

  await sendToApi({
    projectId: project.id,
    command: parsed,
  });

  return { understood: true, action: parsed };
}
