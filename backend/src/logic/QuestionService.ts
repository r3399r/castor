import axios from 'axios';
import { inject, injectable } from 'inversify';
import { In } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { LIMIT, OFFSET } from 'src/constant/Pagination';
import { ConceptAccess } from 'src/dao/ConceptAccess';
import { ExamAccess } from 'src/dao/ExamAccess';
import { QuestionAccess } from 'src/dao/QuestionAccess';
import { ReplyAccess } from 'src/dao/ReplyAccess';
import { SubjectAccess } from 'src/dao/SubjectAccess';
import { TagAccess } from 'src/dao/TagAccess';
import {
  GetQuestionAdaptiveParams,
  GetQuestionAdaptiveResponse,
  GetQuestionIdResponse,
  GetQuestionParams,
  GetQuestionResponse,
  GetQuestionTagParams,
  GetQuestionTagResponse,
  PostQuestionRequest,
  PostQuestionResponse,
  PostQuestionStartRequest,
  PostQuestionStartResponse,
} from 'src/model/api/Question';
import { QuestionEntity } from 'src/model/entity/QuestionEntity';
import { ReplyEntity } from 'src/model/entity/ReplyEntity';
import { Tag } from 'src/model/entity/TagEntity';
import { BadRequestError, UnauthorizedError } from 'src/model/error';
import { genPagination } from 'src/utils/paginator';
import { UserService } from './UserService';

/**
 * Service class for Question
 */
@injectable()
export class QuestionService {
  @inject(QuestionAccess)
  private readonly questionAccess!: QuestionAccess;
  @inject(UserService)
  private readonly userService!: UserService;
  @inject(ReplyAccess)
  private readonly replyAccess!: ReplyAccess;
  @inject(SubjectAccess)
  private readonly subjectAccess!: SubjectAccess;
  @inject(ExamAccess)
  private readonly examAccess!: ExamAccess;
  @inject(TagAccess)
  private readonly tagAccess!: TagAccess;
  @inject(ConceptAccess)
  private readonly conceptAccess!: ConceptAccess;

  public async getQuestionByUuid(uuid: string): Promise<GetQuestionIdResponse> {
    return await this.questionAccess.findOneOrFailByUuid(uuid);
  }

  public async getAdaptiveQuestion(
    params: GetQuestionAdaptiveParams | null
  ): Promise<GetQuestionAdaptiveResponse> {
    console.log(params);

    const question = await this.questionAccess.findOneOrFailById(2);

    return {
      ...question,
      children: question.children?.sort(
        (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
      ),
    };
  }

  public async getAllTags(
    params: GetQuestionTagParams | null
  ): Promise<GetQuestionTagResponse> {
    if (!params?.categoryId)
      throw new BadRequestError('categoryId is required');

    return await this.questionAccess.findTag(params.categoryId);
  }

  public async getQuestionList(
    params: GetQuestionParams | null
  ): Promise<GetQuestionResponse> {
    if (!params) throw new BadRequestError('query parameters are required');

    const limit = params?.limit ? Number(params.limit) : LIMIT;
    const offset = params?.offset ? Number(params.offset) : OFFSET;

    const [questions, total] = await this.questionAccess.findAndCount({
      subjectId: Number(params.subjectId),
      take: limit,
      skip: offset,
      examId: params.examId ? Number(params.examId) : undefined,
      tagIds: params.tagIds
        ? params.tagIds.split(',').map((v) => Number(v))
        : undefined,
      conceptIds: params.conceptIds
        ? params.conceptIds.split(',').map((v) => Number(v))
        : undefined,
    });

    return {
      data: questions.map((q) => ({
        ...q,
        children: q.children?.sort(
          (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
        ),
      })),
      paginate: genPagination(total, limit, offset),
    };
  }

  private async postFb(imageUrl: string, caption: string) {
    const fbPageId = process.env.FB_PAGE_ID;
    const fbAccessToken = process.env.FB_ACCESS_TOKEN;
    const res = await axios.post(
      `https://graph.facebook.com/${fbPageId}/photos`,
      {
        url: imageUrl,
        access_token: fbAccessToken,
        caption,
      }
    );

    return res.data;
  }

  private async commentFbPost(postId: string, questionUuid: string) {
    const fbAccessToken = process.env.FB_ACCESS_TOKEN;
    await axios.post(`https://graph.facebook.com/${postId}/comments`, {
      message: `https://pmp${process.env.ENVR === 'prod' ? '' : '-test'}.celestialstudio.net/q/${questionUuid}`,
      access_token: fbAccessToken,
    });
  }

  public async createQuestion(
    data: PostQuestionRequest
  ): Promise<PostQuestionResponse> {
    if (data.conceptIds.length === 0)
      throw new BadRequestError(
        'At least one concept is required for a group question'
      );

    const subject = await this.subjectAccess.findOneOrFail({
      where: { id: data.subjectId },
    });

    await this.examAccess.findOneOrFail({
      where: { id: data.examId, subjectId: data.subjectId },
    });

    let tags: Tag[] = [];
    if (data.tagIds !== undefined && data.tagIds.length > 0) {
      const tagIdsSet = new Set(data.tagIds);
      tags = await this.tagAccess.find({
        where: { id: In([...tagIdsSet]) },
      });
      if (tags.length !== tagIdsSet.size)
        throw new BadRequestError(
          'Some tags are invalid for the specified subject'
        );
      for (const tag of tags)
        if (tag.subjectId !== subject.id)
          throw new BadRequestError('Invalid tag for the specified subject');
    }

    const conceptIdsSet = new Set(data.conceptIds);
    const concepts = await this.conceptAccess.find({
      where: { id: In([...conceptIdsSet]) },
    });
    if (concepts.length !== conceptIdsSet.size)
      throw new BadRequestError(
        'Some concepts are invalid for the specified subject'
      );
    for (const concept of concepts)
      if (concept.conceptGroup.subjectId !== subject.id)
        throw new BadRequestError('Invalid concept for the specified subject');

    const fbPost = await this.postFb(
      data.imageUrl,
      [subject.name, ...tags.map((t) => t.name), ...concepts.map((c) => c.name)]
        .map((t) => `#${t}`)
        .join(' ')
    );

    const questionEntity = new QuestionEntity();
    questionEntity.uuid = uuidv4();
    questionEntity.subjectId = data.subjectId;
    questionEntity.parentId = null;
    questionEntity.fbPostId = fbPost.post_id;
    questionEntity.isGroup = data.type === 'GROUP';
    questionEntity.type = data.type;
    questionEntity.sortOrder = null;
    questionEntity.content = data.content ?? null;
    questionEntity.options = data.options ?? null;
    questionEntity.answer = data.answer ?? null;
    questionEntity.difficulty = data.difficulty;
    questionEntity.adjustedDifficulty = data.difficulty;
    questionEntity.tag = tags;
    questionEntity.concept = concepts;

    const newQuestionEntity = await this.questionAccess.save(questionEntity);

    await this.commentFbPost(fbPost.post_id, newQuestionEntity.uuid);

    const children: QuestionEntity[] = [];
    if (data.childQuestions !== undefined)
      for (const child of data.childQuestions) {
        const childEntity = new QuestionEntity();
        childEntity.uuid = uuidv4();
        childEntity.subjectId = data.subjectId;
        childEntity.parentId = newQuestionEntity.id;
        childEntity.fbPostId = null;
        childEntity.isGroup = false;
        childEntity.type = child.type;
        childEntity.sortOrder = child.sortOrder;
        childEntity.content = child.content;
        childEntity.options = child.options;
        childEntity.answer = child.answer;
        childEntity.difficulty = data.difficulty;
        childEntity.adjustedDifficulty = data.difficulty;

        const tmpQuestion = await this.questionAccess.save(childEntity);
        children.push(tmpQuestion);
      }

    return [newQuestionEntity, ...children];
  }

  // private calculateMultipleScore(
  //   correct: string | null,
  //   replied: string,
  //   options: string | null
  // ): number {
  //   if (!correct || !options) return 1;
  //   if (replied === '') return 0;

  //   const answerSet = new Set(correct.split(','));
  //   const repliedSet = new Set(replied.split(','));

  //   const missing = [...answerSet].filter((o) => !repliedSet.has(o)).length;
  //   const extra = [...repliedSet].filter((o) => !answerSet.has(o)).length;

  //   const n = options.split(',').length;
  //   const k = missing + extra;

  //   return n - 2 * k <= 0
  //     ? 0
  //     : bn(n - 2 * k)
  //       .div(n)
  //       .dp(4, 7)
  //       .toNumber();
  // }

  // private calculateFillScore(correct: string[], replied: string[]) {
  //   if (correct.length !== replied.length) return 0;
  //   for (let i = 0; i < correct.length; i++)
  //     if (correct[i] !== replied[i]) return 0;

  //   return 1;
  // }

  public async startQuestion(
    data: PostQuestionStartRequest
  ): Promise<PostQuestionStartResponse> {
    const user = await this.userService.getUser();
    if (user === null) throw new UnauthorizedError('User not found');

    const replyEntity = new ReplyEntity();
    replyEntity.userId = user.id;
    replyEntity.questionId = data.id;
    replyEntity.score = 0;
    // replyEntity.complete = false;
    // replyEntity.recordedAt = new Date().toISOString();

    const newReply = await this.replyAccess.save(replyEntity);

    return {
      id: newReply.id,
      questionId: newReply.questionId,
      userId: newReply.userId,
    };
  }

  // public async completeQuestion(
  //   data: PostQuestionCompleteRequest
  // ): Promise<PostQuestionCompleteResponse> {
  //   const user = await this.userService.getUser();
  //   if (user === null) throw new UnauthorizedError('User not found');

  //   const reply = await this.replyAccess.findOne({
  //     where: {
  //       id: data.replyId,
  //       userId: user.id,
  //       questionId: data.id,
  //       complete: false,
  //     },
  //   });
  //   if (reply === null) throw new UnauthorizedError('Reply not found');

  //   const question = await this.questionAccess.findOneOrFail({
  //     where: { id: data.id },
  //   });
  //   if (data.replied.length !== question.minor.length)
  //     throw new BadRequestError('The number of replied answers is not matched');
  //   const totalScore = question.minor
  //     .map((v) => {
  //       if (v.type === 'SINGLE')
  //         return data.replied.find((r) => r.id === v.id)?.answer === v.answer
  //           ? 1
  //           : 0;
  //       else if (v.type === 'MULTIPLE')
  //         return this.calculateMultipleScore(
  //           v.answer,
  //           data.replied.find((r) => r.id === v.id)?.answer ?? '',
  //           v.options
  //         );
  //       else if (v.type === 'FILL')
  //         return this.calculateFillScore(
  //           v.answer?.split(',') ?? [],
  //           data.replied.find((r) => r.id === v.id)?.answer.split(',') ?? []
  //         );

  //       return 0;
  //     })
  //     .reduce((prev, cur) => prev.plus(cur), bn(0));
  //   const score = totalScore.div(question.minor.length).dp(4, 7).toNumber();

  //   reply.score = score;
  //   reply.repliedAnswer = data.replied.map((r) => r.answer).join('|');
  //   reply.complete = true;
  //   reply.recordedAt = new Date().toISOString();

  //   const newReply = await this.replyAccess.save(reply);

  //   return {
  //     ...newReply,
  //     actualAnswer: question.minor.map((m) => m.answer).join('|'),
  //     fbPostId: question.fbPostId,
  //   };
  // }
}
