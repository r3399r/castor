import axios from 'axios';
import { inject, injectable } from 'inversify';
import { In, MoreThan } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { LIMIT, OFFSET } from 'src/constant/Pagination';
import { ConceptAccess } from 'src/dao/ConceptAccess';
import { ConceptGroupAccess } from 'src/dao/ConceptGroupAccess';
import { ExamAccess } from 'src/dao/ExamAccess';
import { PendingReplyAccess } from 'src/dao/PendingReplyAccess';
import { QuestionAccess } from 'src/dao/QuestionAccess';
import { ReplyAccess } from 'src/dao/ReplyAccess';
import { SubjectAccess } from 'src/dao/SubjectAccess';
import { TagAccess } from 'src/dao/TagAccess';
import { UserConceptStatAccess } from 'src/dao/UserConceptStatAccess';
import {
  GetQuestionAdaptiveParams,
  GetQuestionAdaptiveResponse,
  GetQuestionIdResponse,
  GetQuestionParams,
  GetQuestionResponse,
  PostQuestionRequest,
  PostQuestionResponse,
} from 'src/model/api/Question';
import { PendingReplyEntity } from 'src/model/entity/PendingReplyEntity';
import { Question, QuestionEntity } from 'src/model/entity/QuestionEntity';
import { Tag } from 'src/model/entity/TagEntity';
import {
  BadRequestError,
  NotFoundError,
  UnauthorizedError,
} from 'src/model/error';
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
  @inject(UserConceptStatAccess)
  private readonly userConceptStatAccess!: UserConceptStatAccess;
  @inject(ConceptGroupAccess)
  private readonly conceptGroupAccess!: ConceptGroupAccess;
  @inject(PendingReplyAccess)
  private readonly pendingReplyAccess!: PendingReplyAccess;

  public async getQuestionByUuid(uuid: string): Promise<GetQuestionIdResponse> {
    return await this.questionAccess.findOneOrFailByUuid(uuid);
  }

  private getQuestionSorting(question: Question): Question {
    return {
      ...question,
      children: question.children?.sort(
        (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
      ),
    };
  }

  public async getAdaptiveQuestion(
    params: GetQuestionAdaptiveParams | null
  ): Promise<GetQuestionAdaptiveResponse> {
    if (!params) throw new BadRequestError('query parameters are required');

    const user = await this.userService.getUser();
    if (user === null) throw new UnauthorizedError('User not found');

    // get candidate concepts and their numberOfQuestions
    const conceptIds = new Map<number, number>();
    if (params.conceptIds) {
      const conceptList = await this.conceptAccess.find({
        where: { id: In(params.conceptIds.split(',').map((v) => Number(v))) },
      });
      for (const concept of conceptList) {
        if (concept.conceptGroup.subjectId !== Number(params.subjectId))
          throw new BadRequestError(
            'Invalid concept for the specified subject'
          );
        conceptIds.set(concept.id, concept.numberOfQuestions);
      }
    } else {
      const conceptGroups = await this.conceptGroupAccess.find({
        where: { subjectId: Number(params.subjectId) },
        relations: {
          concepts: true,
        },
      });
      for (const group of conceptGroups)
        for (const concept of group.concepts)
          if (concept.numberOfQuestions > 0)
            conceptIds.set(concept.id, concept.numberOfQuestions);
    }

    const pendingReplyList = await this.pendingReplyAccess.find({
      where: {
        userId: user.id,
      },
      relations: {
        question: {
          subject: true,
          exam: true,
          tag: true,
          concept: true,
          children: true,
        },
      },
      order: {
        createdAt: 'desc',
      },
    });
    if (pendingReplyList.length > 0)
      for (const pendingReply of pendingReplyList)
        for (const concept of pendingReply.question.concept)
          if (conceptIds.has(concept.id))
            return this.getQuestionSorting(pendingReply.question);

    // random picking conceptId with weight of numberOfQuestions
    const totalQuestions = Array.from(conceptIds.values()).reduce(
      (a, b) => a + b,
      0
    );
    let random = Math.random() * totalQuestions;
    let selectedConceptId: number | null = null;
    for (const [conceptId, numberOfQuestions] of conceptIds) {
      random -= numberOfQuestions;
      if (random <= 0) {
        selectedConceptId = conceptId;
        break;
      }
    }
    if (selectedConceptId === null)
      throw new BadRequestError('No concept found');

    // find last 7 days reply of the user for the subject
    const interval = 7 * 24 * 60 * 60 * 1000;
    const lastReplies = await this.replyAccess.find({
      where: {
        subjectId: Number(params.subjectId),
        userId: user.id,
        createdAt: MoreThan(new Date(Date.now() - interval).toISOString()),
      },
    });

    const userConceptStat = await this.userConceptStatAccess.findOne({
      where: {
        userId: user.id,
        conceptId: selectedConceptId,
      },
    });

    const mastery = userConceptStat?.mastery ?? 0;
    const questionList = await this.questionAccess.findAdaptive({
      mastery,
      subjectId: Number(params.subjectId),
      take: 20 + lastReplies.length,
      examIds: params.examIds
        ? params.examIds.split(',').map((v) => Number(v))
        : undefined,
      tagIds: params.tagIds
        ? params.tagIds.split(',').map((v) => Number(v))
        : undefined,
      conceptId: selectedConceptId,
    });
    if (questionList.length === 0) throw new NotFoundError('No question found');

    // sort question list and exclude reason replied questions and pick top 20
    const candidateList = questionList
      .filter((q) => !lastReplies.some((r) => r.questionId === q.id))
      .sort(
        (a, b) =>
          Math.abs(a.adjustedDifficulty - mastery) -
          Math.abs(b.adjustedDifficulty - mastery)
      )
      .slice(0, 20);

    // return randomly picked question
    const question =
      candidateList.length > 0
        ? candidateList[Math.floor(Math.random() * candidateList.length)]
        : questionList[Math.floor(Math.random() * questionList.length)];

    const pendingReplyEntity = new PendingReplyEntity();
    pendingReplyEntity.questionId = question.id;
    pendingReplyEntity.userId = user.id;
    await this.pendingReplyAccess.save(pendingReplyEntity);

    return this.getQuestionSorting(question);
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
      examIds: params.examIds
        ? params.examIds.split(',').map((v) => Number(v))
        : undefined,
      tagIds: params.tagIds
        ? params.tagIds.split(',').map((v) => Number(v))
        : undefined,
      conceptIds: params.conceptIds
        ? params.conceptIds.split(',').map((v) => Number(v))
        : undefined,
    });

    return {
      data: questions.map((q) => this.getQuestionSorting(q)),
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

  private async commentFbPost(postId: string, solution: string) {
    const fbAccessToken = process.env.FB_ACCESS_TOKEN;
    await axios.post(`https://graph.facebook.com/${postId}/comments`, {
      message: solution,
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
      relations: { category: true },
    });

    const exam = await this.examAccess.findOneOrFail({
      where: { id: data.examId },
      relations: { subject: true },
    });
    if (!exam.subject.some((s) => s.id === subject.id))
      throw new BadRequestError('Invalid exam for the specified subject');

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
    for (const concept of concepts) {
      if (concept.conceptGroup.subjectId !== subject.id)
        throw new BadRequestError('Invalid concept for the specified subject');
      concept.numberOfQuestions += 1;
      await this.conceptAccess.save(concept);
    }
    const fbPost = await this.postFb(
      data.imageUrl,
      [
        ...subject.category.map((c) => c.name),
        subject.name,
        exam.name,
        ...tags.map((t) => t.name),
        ...concepts.map((c) => c.name),
      ]
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
    questionEntity.exam = [exam];
    questionEntity.tag = tags;
    questionEntity.concept = concepts;

    const newQuestionEntity = await this.questionAccess.save(questionEntity);

    if (data.solution) await this.commentFbPost(fbPost.post_id, data.solution);

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
}
