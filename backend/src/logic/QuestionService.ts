import {
  GetQuestionAdaptiveParams,
  GetQuestionAdaptiveResponse,
  GetQuestionIdResponse,
  GetQuestionParams,
  GetQuestionResponse,
  PostQuestionRequest,
  // PostQuestionResponse,
  Question,
  Tag,
} from '@castor/shared';
import axios from 'axios';
import { inject, injectable } from 'inversify';
import { In, MoreThan } from 'typeorm';
// import { v4 as uuidv4 } from 'uuid';
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
import { PendingReplyEntity } from 'src/model/entity/PendingReplyEntity';
// import { QuestionEntity } from 'src/model/entity/QuestionEntity';
import { BadRequestError, UnauthorizedError } from 'src/model/error';
import { htmlToS3Url } from 'src/utils/htmlSnapshot';
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
    console.log('Adaptive question params:', params);

    const requiredCount = params.count ? Number(params.count) : 1;
    const user = await this.userService.getUser();
    if (user === null) throw new UnauthorizedError('User not found');

    // get candidate concepts and their numberOfQuestions
    console.log('Getting candidate concepts for subjectId:', params.subjectId);
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
    console.log('Candidate concepts:', conceptIds);
    const totalQuestions = Array.from(conceptIds.values()).reduce(
      (a, b) => a + b,
      0
    );
    console.log('Total questions for candidate concepts:', totalQuestions);

    const response: Map<number, Question> = new Map();

    console.log('Getting pending replies for userId:', user.id);
    const pendingReplyList = await this.pendingReplyAccess.find({
      where: {
        userId: user.id,
      },
      relations: {
        question: {
          subject: true,
          exam: true,
          tag: true,
          concept: { conceptGroup: true },
          children: true,
        },
      },
      order: {
        createdAt: 'desc',
      },
    });
    console.log('Found pending replies:', pendingReplyList.length);
    if (pendingReplyList.length > 0)
      for (const pendingReply of pendingReplyList)
        for (const concept of pendingReply.question.concept)
          if (conceptIds.has(concept.id)) {
            console.log(
              'Adding pending reply question to response, questionId:',
              pendingReply.questionId
            );
            response.set(
              pendingReply.questionId,
              this.getQuestionSorting(pendingReply.question)
            );
            break;
          }

    if (response.size >= requiredCount) {
      console.log(
        'pending replies fulfill required count, returning pending reply questions'
      );

      return Array.from(response.values()).slice(0, requiredCount);
    }

    // find last 7 days reply of the user for the subject
    const interval = 7 * 24 * 60 * 60 * 1000;
    const lastReplies = await this.replyAccess.find({
      where: {
        subjectId: Number(params.subjectId),
        userId: user.id,
        createdAt: MoreThan(new Date(Date.now() - interval).toISOString()),
      },
    });
    const lastReplyQuestionIds = new Set<number>();
    for (const reply of lastReplies)
      if (reply.parentId === null) lastReplyQuestionIds.add(reply.questionId);
      else lastReplyQuestionIds.add(reply.parentId);

    console.log(
      'Found recent replies in last 7 days:',
      lastReplyQuestionIds.size
    );

    const baseCandidateTake =
      conceptIds.size * (5 + Math.ceil(lastReplyQuestionIds.size / 2));
    console.log('base candidate take:', baseCandidateTake);

    const candidateQuestionMap = new Map<number, Question>();
    const lastReplyQuestionMap = new Map<number, Question>();
    for (const conceptId of conceptIds.keys()) {
      const userConceptStat = await this.userConceptStatAccess.findOne({
        where: {
          userId: user.id,
          conceptId,
        },
      });
      const mastery = userConceptStat?.mastery ?? 0;
      console.log(
        `Getting candidate questions for conceptId ${conceptId} with mastery ${mastery}`
      );

      const weightedCandidateTake = Math.ceil(
        baseCandidateTake * (conceptIds.get(conceptId) ?? 1 / totalQuestions)
      );
      const questionList = await this.questionAccess.findAdaptive({
        mastery,
        subjectId: Number(params.subjectId),
        take: weightedCandidateTake,
        examIds: params.examIds
          ? params.examIds.split(',').map((v) => Number(v))
          : undefined,
        tagIds: params.tagIds
          ? params.tagIds.split(',').map((v) => Number(v))
          : undefined,
        conceptId,
      });
      console.log(
        `Found ${questionList.length} candidate questions for conceptId ${conceptId}`
      );

      for (const question of questionList) {
        if (lastReplyQuestionIds.has(question.id)) {
          console.log(
            'Skipping questionId',
            question.id,
            'because it was replied recently'
          );
          lastReplyQuestionMap.set(question.id, question);
          continue;
        }
        if (pendingReplyList.some((pr) => pr.questionId === question.id)) {
          console.log(
            'Skipping questionId',
            question.id,
            'because it is in pending reply'
          );
          continue;
        }
        if (!candidateQuestionMap.has(question.id)) {
          console.log(
            'Adding candidate questionId to candidateQuestionMap:',
            question.id
          );
          candidateQuestionMap.set(question.id, question);
        }
      }
    }
    console.log(
      'Total candidate questions after filtering:',
      candidateQuestionMap.size
    );

    const remaingCount = requiredCount - response.size;
    console.log(
      'Remaining slots to fill after adding pending replies:',
      remaingCount
    );
    for (let i = 0; i < remaingCount; i++)
      if (candidateQuestionMap.size > 0) {
        const randomIndex = Math.floor(
          Math.random() * candidateQuestionMap.size
        );
        const question = Array.from(candidateQuestionMap.values())[randomIndex];
        console.log(
          'Adding candidate question to response, questionId:',
          question.id
        );
        response.set(question.id, this.getQuestionSorting(question));
        candidateQuestionMap.delete(question.id);
      } else if (lastReplyQuestionMap.size > 0) {
        console.log(
          'No more candidate questions available to fill the response. Pick from last replies'
        );
        const randomIndex = Math.floor(
          Math.random() * lastReplyQuestionMap.size
        );
        const question = Array.from(lastReplyQuestionMap.values())[randomIndex];
        console.log(
          'Adding last reply question to response, questionId:',
          question.id
        );
        response.set(question.id, this.getQuestionSorting(question));
        lastReplyQuestionMap.delete(question.id);
      }

    for (const question of response.values()) {
      if (pendingReplyList.some((pr) => pr.questionId === question.id)) {
        console.log(
          'QuestionId',
          question.id,
          'is already in pending replies, skipping adding to pending replies again'
        );
        continue;
      }
      console.log(
        'Adding questionId to pending replies, questionId:',
        question.id
      );
      const pendingReplyEntity = new PendingReplyEntity();
      pendingReplyEntity.questionId = question.id;
      pendingReplyEntity.userId = user.id;
      await this.pendingReplyAccess.save(pendingReplyEntity);
    }

    return Array.from(response.values());
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

  // private async commentFbPost(postId: string, solution: string) {
  //   const fbAccessToken = process.env.FB_ACCESS_TOKEN;
  //   await axios.post(`https://graph.facebook.com/${postId}/comments`, {
  //     message: solution,
  //     access_token: fbAccessToken,
  //   });
  // }

  public async createQuestion(
    data: PostQuestionRequest
  ) {
    const user = await this.userService.getUser();
    if (user === null) throw new UnauthorizedError('User not found');
    if (user.email !== 'lamplighter.planet@gmail.com')
      throw new UnauthorizedError('Unauthorized user');

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
    const caption = [
      ...subject.category.map((c) => c.name),
      subject.name,
      exam.name,
      ...tags.map((t) => t.name),
      ...concepts.map((c) => c.name),
    ]
      .map((t) => `#${t}`)
      .join(' ');

    if (data.content) {
      const { url, key:_key } = await htmlToS3Url(data.content);
      await this.postFb(url, caption);
      // await deleteS3File(key);
    }

    // const questionEntity = new QuestionEntity();
    // questionEntity.uuid = uuidv4();
    // questionEntity.subjectId = data.subjectId;
    // questionEntity.parentId = null;
    // questionEntity.fbPostId = fbPostId;
    // questionEntity.isGroup = data.type === 'GROUP';
    // questionEntity.type = data.type;
    // questionEntity.sortOrder = null;
    // questionEntity.content = data.content ?? null;
    // questionEntity.options = data.options ?? null;
    // questionEntity.answer = data.answer ?? null;
    // questionEntity.difficulty = data.difficulty;
    // questionEntity.adjustedDifficulty = data.difficulty;
    // questionEntity.exam = [exam];
    // questionEntity.tag = tags;
    // questionEntity.concept = concepts;

    // const newQuestionEntity = await this.questionAccess.save(questionEntity);

    // if (fbPostId && data.solution) await this.commentFbPost(fbPostId, data.solution);

    // const children: QuestionEntity[] = [];
    // if (data.childQuestions !== undefined)
    //   for (const child of data.childQuestions) {
    //     const childEntity = new QuestionEntity();
    //     childEntity.uuid = uuidv4();
    //     childEntity.subjectId = data.subjectId;
    //     childEntity.parentId = newQuestionEntity.id;
    //     childEntity.fbPostId = null;
    //     childEntity.isGroup = false;
    //     childEntity.type = child.type;
    //     childEntity.sortOrder = child.sortOrder;
    //     childEntity.content = child.content;
    //     childEntity.options = child.options;
    //     childEntity.answer = child.answer;
    //     childEntity.difficulty = data.difficulty;
    //     childEntity.adjustedDifficulty = data.difficulty;

    //     const tmpQuestion = await this.questionAccess.save(childEntity);
    //     children.push(tmpQuestion);
    //   }

    // return [newQuestionEntity, ...children];
  }
}
