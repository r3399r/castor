import { PostPreviewRequest } from '@castor/shared';
import { GoogleGenAI } from '@google/genai';
import { inject, injectable } from 'inversify';
import { UnauthorizedError } from 'src/model/error';
import { UserService } from './UserService';

/**
 * Service class for Preview
 */
@injectable()
export class PreviewService {
  @inject(UserService)
  private readonly userService!: UserService;

  public async preview(data: PostPreviewRequest) {
    const user = await this.userService.getUser();
    if (user === null) throw new UnauthorizedError('User not found');
    if (user.email !== 'lamplighter.planet@gmail.com')
      throw new UnauthorizedError('Unauthorized user');

    const ai = new GoogleGenAI({
      apiKey: process.env.GOOGLE_GENAI_API_KEY!,
    });

    const response = await fetch(data.imageUrl);
    const imageArrayBuffer = await response.arrayBuffer();
    const base64ImageData = Buffer.from(imageArrayBuffer).toString('base64');

    const result = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: [
        {
          inlineData: {
            mimeType: 'image/jpeg',
            data: base64ImageData,
          },
        },
        { text: data.text },
      ],
    });

    return (
      result.candidates?.at(0)?.content?.parts?.at(0)?.text ?? 'No response'
    );
  }
}
