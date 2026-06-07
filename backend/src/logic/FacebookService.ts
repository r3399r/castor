import AWS from 'aws-sdk';
import axios from 'axios';
import { inject, injectable } from 'inversify';
import { QuestionAccess } from 'src/dao/QuestionAccess';
import { deleteS3File, htmlToS3Url } from 'src/utils/htmlSnapshot';

@injectable()
export class FacebookService {
  @inject(QuestionAccess)
  private readonly questionAccess!: QuestionAccess;

  private get ruleName(): string {
    return `${process.env.PROJECT}-${process.env.ENVR}-facebook`;
  }

  public async enableEventBridge(): Promise<void> {
    const eb = new AWS.EventBridge();
    await eb.enableRule({ Name: this.ruleName }).promise();
  }

  private async disableEventBridge(): Promise<void> {
    const eb = new AWS.EventBridge();
    await eb.disableRule({ Name: this.ruleName }).promise();
  }

  private async postFb(imageUrl: string, caption: string) {
    const res = await axios.post(
      `https://graph.facebook.com/${process.env.FB_PAGE_ID}/photos`,
      {
        url: imageUrl,
        access_token: process.env.FB_ACCESS_TOKEN,
        caption,
      }
    );

    return res.data;
  }

  public async processNextQuestion(): Promise<void> {
    const question = await this.questionAccess.findNextUnposted();

    if (!question) {
      await this.disableEventBridge();

      return;
    }

    const subject = question.subject;
    const caption = [
      ...subject.category.map((c) => c.name),
      subject.name,
      ...question.exam.map((e) => e.name),
      ...question.tag.map((t) => t.name),
      ...question.concept.map((c) => c.name),
    ]
      .map((t) => `#${t.replace(/\s+/g, '')}`)
      .join(' ');

    const sortedChildren = (question.children ?? [])
      .slice()
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    const fullContent = [
      question.content,
      ...sortedChildren.map((c) => c.content),
    ]
      .filter(Boolean)
      .join('');
    const { url, key } = await htmlToS3Url(fullContent);
    try {
      const fbPost = await this.postFb(url, caption);
      question.fbPostId = fbPost.post_id;
      await this.questionAccess.save(question);
    } finally {
      await deleteS3File(key);
    }
  }
}
