// @ts-nocheck
import { gsap } from "gsap";

export function startHomeHeroMotionAnimation(heroObject: HTMLObjectElement) {
  let context: gsap.Context | null = null;

  const runAnimation = () => {
    const svgDoc = heroObject.contentDocument;

    if (!svgDoc) {
      return;
    }

    context?.revert();
    context = gsap.context(() => {
    const book = svgDoc.querySelector("#book, #hero-book");
    const pageRight = svgDoc.querySelector("#page-right");
    const pageLeft = svgDoc.querySelector("#page-left");
    const tag = svgDoc.querySelector("#tag");
    const svgRoot = svgDoc.querySelector("svg");
    const cardSequenceConfigs = [
      {
        key: "chemistry",
        cardSelector: "#card-chemistry",
        lineSelector: "#line2",
        outDuration: 0.92,
        returnDuration: 0.42,
        outGap: 0.48,
        returnGap: 0.14,
        startRotation: 8.5,
        endRotation: 0.05,
        returnRotation: 9.5,
        startScale: 0.72,
        returnScale: 0.56,
        startInset: 18,
        lineLagDistance: 12,
        overshootDistance: 1.6,
        floatAmplitude: 3.2,
        floatRotation: 0.08,
        floatDurations: [1.45, 1.55],
      },
      {
        key: "biology",
        cardSelector: "#card-biology",
        lineSelector: "#line3",
        reversePath: true,
        outDuration: 0.9,
        returnDuration: 0.4,
        outGap: 0.46,
        returnGap: 0.12,
        startRotation: 7.4,
        endRotation: -0.1,
        returnRotation: 8.6,
        startScale: 0.74,
        returnScale: 0.58,
        startInset: 17,
        lineLagDistance: 11,
        overshootDistance: 1.4,
        floatAmplitude: 2.8,
        floatRotation: 0.06,
        floatDurations: [1.35, 1.7],
      },
      {
        key: "social",
        cardSelector: "#card-social",
        lineSelector: "#line5",
        outDuration: 0.96,
        returnDuration: 0.43,
        outGap: 0.5,
        returnGap: 0.12,
        startRotation: 9.2,
        endRotation: 0.12,
        returnRotation: 10.2,
        startScale: 0.7,
        returnScale: 0.54,
        startInset: 20,
        lineLagDistance: 13,
        overshootDistance: 1.8,
        floatAmplitude: 3.4,
        floatRotation: 0.09,
        floatDurations: [1.6, 1.45],
      },
      {
        key: "science",
        cardSelector: "#card-science",
        lineSelector: "#line1",
        reversePath: true,
        outDuration: 0.88,
        returnDuration: 0.38,
        outGap: 0.46,
        returnGap: 0.12,
        startRotation: -8.2,
        endRotation: -0.04,
        returnRotation: -9.2,
        startScale: 0.76,
        returnScale: 0.59,
        startInset: 17,
        lineLagDistance: 11,
        overshootDistance: 1.5,
        floatAmplitude: 2.9,
        floatRotation: 0.07,
        floatDurations: [1.4, 1.6],
      },
      {
        key: "globe",
        cardSelector: "#card-globe",
        lineSelector: "#line6",
        outDuration: 0.94,
        returnDuration: 0.41,
        outGap: 0.48,
        returnGap: 0.12,
        startRotation: -7.8,
        endRotation: 0.08,
        returnRotation: -8.8,
        startScale: 0.73,
        returnScale: 0.57,
        startInset: 19,
        lineLagDistance: 12,
        overshootDistance: 1.7,
        floatAmplitude: 3.1,
        floatRotation: 0.08,
        floatDurations: [1.5, 1.52],
      },
      {
        key: "art",
        cardSelector: "#card-art",
        lineSelector: "#line4",
        outDuration: 0.9,
        returnDuration: 0.39,
        outGap: 0.48,
        returnGap: 0,
        startRotation: 8.8,
        endRotation: -0.06,
        returnRotation: 9.4,
        startScale: 0.72,
        returnScale: 0.55,
        startInset: 18,
        lineLagDistance: 12,
        overshootDistance: 1.5,
        floatAmplitude: 2.7,
        floatRotation: 0.05,
        floatDurations: [1.42, 1.58],
      },
    ];
    const cardAnimations = [];

    if (!book || !pageRight || !pageLeft || !tag) {
      console.error("找不到 hero 書本動畫需要的節點");
      return;
    }

    const pageRightFlip = pageRight.cloneNode(true);
    const pageRightFlipParts = Array.from(pageRightFlip.children);
    const pageOrigin = "503.031 696.449";
    const tagOrigin = "572.031 712.949";
    const xOffset = 267.531;
    const yOffset = 410.765;

    pageRightFlip.setAttribute("id", "page-right-flip");
    book.appendChild(pageRightFlip);

    gsap.set([pageRight, pageLeft], {
      svgOrigin: pageOrigin,
      transformOrigin: "50% 50%",
    });

    gsap.set(tag, {
      svgOrigin: tagOrigin,
    });

    gsap.set(pageRightFlip, {
      opacity: 0,
    });

    if (svgRoot) {
      let defs = svgDoc.querySelector("defs");

      if (!defs) {
        defs = svgDoc.createElementNS("http://www.w3.org/2000/svg", "defs");
        svgRoot.insertBefore(defs, svgRoot.firstChild);
      }

      cardSequenceConfigs.forEach((config) => {
        const card = svgDoc.querySelector(config.cardSelector);
        const line = svgDoc.querySelector(config.lineSelector);

        if (!card || !line) {
          console.warn(`找不到 ${config.cardSelector} 或 ${config.lineSelector}，略過 ${config.key} 卡片動畫`);
          return;
        }

        const cardBox = card.getBBox();
        const cardCenter = {
          x: cardBox.x + cardBox.width / 2,
          y: cardBox.y + cardBox.height / 2,
        };
        const cardOrigin = `${cardCenter.x} ${cardCenter.y}`;
        const lineLength = line.getTotalLength();
        const reversePath = Boolean(config.reversePath);
        const originalStart = line.getPointAtLength(0);
        const originalNearStart = line.getPointAtLength(Math.min(2, lineLength));
        const originalEnd = line.getPointAtLength(lineLength);
        const originalNearEnd = line.getPointAtLength(Math.max(0, lineLength - 2));
        const bookPoint = reversePath ? originalEnd : originalStart;
        const bookNearPoint = reversePath ? originalNearEnd : originalNearStart;
        const finalPoint = reversePath ? originalStart : originalEnd;
        const finalNearPoint = reversePath ? originalNearStart : originalNearEnd;
        const startTangent = {
          x: bookNearPoint.x - bookPoint.x,
          y: bookNearPoint.y - bookPoint.y,
        };
        const lineTangent = {
          x: finalPoint.x - finalNearPoint.x,
          y: finalPoint.y - finalNearPoint.y,
        };
        const startTangentLength = Math.hypot(startTangent.x, startTangent.y) || 1;
        const tangentLength = Math.hypot(lineTangent.x, lineTangent.y) || 1;
        const normalizedStartTangent = {
          x: startTangent.x / startTangentLength,
          y: startTangent.y / startTangentLength,
        };
        const normalizedTangent = {
          x: lineTangent.x / tangentLength,
          y: lineTangent.y / tangentLength,
        };
        const cardStart = {
          x: bookPoint.x - normalizedStartTangent.x * config.startInset + (cardCenter.x - finalPoint.x),
          y: bookPoint.y - normalizedStartTangent.y * config.startInset + (cardCenter.y - finalPoint.y),
        };
        const cardOffset = {
          x: cardCenter.x - finalPoint.x,
          y: cardCenter.y - finalPoint.y,
        };
        const maskId = `${config.key}-line-reveal-mask`;
        const maskPathId = `${config.key}-line-reveal-mask-path`;
        let lineMask = svgDoc.querySelector(`#${maskId}`);

        if (!lineMask) {
          lineMask = svgDoc.createElementNS("http://www.w3.org/2000/svg", "mask");
          lineMask.setAttribute("id", maskId);
          lineMask.setAttribute("maskUnits", "userSpaceOnUse");
          lineMask.setAttribute("maskContentUnits", "userSpaceOnUse");

          const viewBox = svgRoot.viewBox.baseVal;

          lineMask.setAttribute("x", String(viewBox.x));
          lineMask.setAttribute("y", String(viewBox.y));
          lineMask.setAttribute("width", String(viewBox.width));
          lineMask.setAttribute("height", String(viewBox.height));

          const lineMaskPath = line.cloneNode(false);

          lineMaskPath.setAttribute("id", maskPathId);
          lineMaskPath.setAttribute("fill", "none");
          lineMaskPath.setAttribute("stroke", "#ffffff");
          lineMaskPath.setAttribute("stroke-linecap", line.getAttribute("stroke-linecap") || "round");
          lineMaskPath.setAttribute("stroke-width", line.getAttribute("stroke-width") || "2");
          lineMaskPath.removeAttribute("stroke-dasharray");
          lineMask.appendChild(lineMaskPath);
          defs.appendChild(lineMask);
        }

        line.setAttribute("mask", `url(#${maskId})`);

        const lineMaskPath = svgDoc.querySelector(`#${maskPathId}`);

        gsap.set(card, {
          svgOrigin: cardOrigin,
          x: 0,
          y: 0,
          rotation: 0,
          scale: 1,
          visibility: "visible",
        });

        if (lineMaskPath) {
          lineMaskPath.setAttribute("stroke-dasharray", `${lineLength} ${lineLength + 24}`);
          lineMaskPath.setAttribute("stroke-dashoffset", "0");
        }

        cardAnimations.push({
          ...config,
          card,
          line,
          lineMaskPath,
          lineLength,
          bookPoint,
          finalPoint,
          cardCenter,
          cardOffset,
          cardStart,
          normalizedStartTangent,
          normalizedTangent,
          reversePath,
        });
      });
    }

    const leafSwayConfigs = [
      { selector: "#leaf-top", origin: "77.531 540.765", rotation: -4.2, duration: 1.15, delay: 0 },
      { selector: "#leaf-right-top", origin: "102.529 515.765", rotation: 3.9, duration: 1.08, delay: 0.16 },
      { selector: "#leaf-right-bottom", origin: "102.531 558.265", rotation: 3.4, duration: 1.18, delay: 0.28 },
      { selector: "#leaf-top_2", origin: "82.529 494.265", rotation: -3.7, duration: 1.12, delay: 0.1 },
    ];

    leafSwayConfigs.forEach((config) => {
      const leaf = svgDoc.querySelector(config.selector);

      if (!leaf) {
        return;
      }

      gsap.set(leaf, {
        svgOrigin: config.origin,
        transformOrigin: "50% 100%",
      });

      gsap.to(leaf, {
        rotation: config.rotation,
        duration: config.duration,
        delay: config.delay,
        ease: "sine.inOut",
        repeat: -1,
        yoyo: true,
      });
    });

    const connectionDotConfigs = [
      { selector: "#connection-1", duration: 3.2, delay: 0 },
      { selector: "#connection-2", duration: 3.6, delay: 0.35 },
      { selector: "#connection-3", duration: 4, delay: 0.7 },
    ];
    const findNearestPathProgress = (path, point, samples = 100) => {
      const pathLength = path.getTotalLength();
      let nearestProgress = 0;
      let nearestDistance = Infinity;

      for (let index = 0; index <= samples; index += 1) {
        const progress = index / samples;
        const pathPoint = path.getPointAtLength(pathLength * progress);
        const distance = Math.hypot(pathPoint.x - point.x, pathPoint.y - point.y);

        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestProgress = progress;
        }
      }

      return nearestProgress;
    };

    connectionDotConfigs.forEach((config) => {
      const group = svgDoc.querySelector(config.selector);
      const path = group?.querySelector("path");
      const dot = group?.querySelector("ellipse");

      if (!path || !dot) {
        return;
      }

      const pathLength = path.getTotalLength();
      const dotBox = dot.getBBox();
      const dotCenter = {
        x: dotBox.x + dotBox.width / 2,
        y: dotBox.y + dotBox.height / 2,
      };
      const dotMotion = {
        progress: findNearestPathProgress(path, dotCenter),
      };
      const targetProgress = dotMotion.progress < 0.5 ? 1 : 0;
      const renderDotOnPath = () => {
        const point = path.getPointAtLength(pathLength * dotMotion.progress);

        gsap.set(dot, {
          x: point.x - dotCenter.x,
          y: point.y - dotCenter.y,
        });
      };

      renderDotOnPath();

      gsap.to(dotMotion, {
        progress: targetProgress,
        duration: config.duration,
        delay: config.delay,
        ease: "sine.inOut",
        repeat: -1,
        yoyo: true,
        onUpdate: renderDotOnPath,
      });
    });

    const starTwinkleGroups = [
      { stars: [], duration: 0.82, opacity: 0.22, scale: 0.82 },
      { stars: [], duration: 1.35, opacity: 0.3, scale: 0.88 },
    ];

    Array.from(svgDoc.querySelectorAll('[id^="star"]')).forEach((star, index) => {
      const starBox = star.getBBox();
      const starOrigin = `${starBox.x + starBox.width / 2} ${starBox.y + starBox.height / 2}`;

      gsap.set(star, {
        svgOrigin: starOrigin,
        transformOrigin: "50% 50%",
      });

      starTwinkleGroups[index % starTwinkleGroups.length].stars.push(star);
    });

    starTwinkleGroups.forEach((group, groupIndex) => {
      gsap.to(group.stars, {
        opacity: group.opacity,
        scale: group.scale,
        duration: group.duration,
        delay: groupIndex * 0.25,
        ease: "sine.inOut",
        repeat: -1,
        yoyo: true,
        stagger: {
          each: 0.18,
          repeat: -1,
          yoyo: true,
        },
      });
    });

    gsap.to(book, {
      y: -2,
      duration: 2.8,
      ease: "sine.inOut",
      repeat: -1,
      yoyo: true,
    });

    const tl = gsap.timeline({
      repeat: -1,
      repeatDelay: 0,
    });

    tl.to(pageRight, {
      rotation: -1.25,
      skewX: -0.28,
      scaleX: 0.998,
      y: -0.28,
      duration: 1.15,
      ease: "sine.inOut",
    })
      .to(pageRight, {
        rotation: -2.45,
        skewX: -0.62,
        scaleX: 0.997,
        y: -0.72,
        duration: 1.05,
        ease: "sine.inOut",
      })
      .to(pageRight, {
        rotation: -1.4,
        skewX: -0.34,
        scaleX: 0.998,
        y: -0.42,
        duration: 1.05,
        delay: 0.25,
        ease: "sine.inOut",
      })
      .to(pageRight, {
        rotation: 0,
        skewX: 0,
        scaleX: 1,
        y: 0,
        duration: 1.45,
        ease: "sine.inOut",
      });

    tl.to(
      pageLeft,
      {
        rotation: 0.62,
        skewX: 0.14,
        scaleX: 1.002,
        y: -0.32,
        duration: 1.15,
        ease: "sine.inOut",
      },
      0
    )
      .to(
        pageLeft,
        {
          rotation: 1.25,
          skewX: 0.32,
          scaleX: 1.003,
          y: -0.78,
          duration: 1.05,
          ease: "sine.inOut",
        },
        1.15
      )
      .to(
        pageLeft,
        {
          rotation: 0.72,
          skewX: 0.18,
          scaleX: 1.002,
          y: -0.42,
          duration: 1.05,
          delay: 0.25,
          ease: "sine.inOut",
        },
        2.2
      )
      .to(
        pageLeft,
        {
          rotation: 0,
          skewX: 0,
          scaleX: 1,
          y: 0,
          duration: 1.45,
          ease: "sine.inOut",
        },
        3.5
      );

    const tagMotion = { lift: 0 };
    const drawTag = () => {
      const lift = tagMotion.lift;
      const curveX = 595.031 + lift * 0.45;
      const curveY = 758.282 - lift * 1.8;
      const notchX = 576.031 + lift * 0.35;
      const notchY = 758.949 - lift * 1.2;
      const tipX = 585.531 + lift * 0.7;
      const tipY = 775.949 - lift * 4.2;

      tag.setAttribute(
        "d",
        `M554.031 761.449L583.031 714.449C590.031 714.449 616.031 722.949 615.031 722.949C614.231 722.949 ${curveX.toFixed(3)} ${curveY.toFixed(3)} ${tipX.toFixed(3)} ${tipY.toFixed(3)}L${notchX.toFixed(3)} ${notchY.toFixed(3)}L554.031 761.449Z`
      );
    };

    tl.to(
      tagMotion,
      {
        lift: 0.42,
        duration: 1.15,
        ease: "sine.inOut",
        onUpdate: drawTag,
      },
      0.12
    )
      .to(
        tagMotion,
        {
          lift: 1,
          duration: 1.05,
          ease: "sine.inOut",
          onUpdate: drawTag,
        },
        1.25
      )
      .to(
        tagMotion,
        {
          lift: 0.5,
          duration: 1.05,
          ease: "sine.inOut",
          onUpdate: drawTag,
        },
        2.45
      )
      .to(
        tagMotion,
        {
          lift: 0,
          duration: 1.45,
          ease: "sine.inOut",
          onUpdate: drawTag,
        },
        3.5
      );

    if (cardAnimations.length) {
      const sequenceStart = 0.85;
      const postAllReturnHold = 0.55;
      const postAllOutHold = 3;
      const cardTravelDurationScale = 0.72;
      const sampleLinePoint = (cardAnimation, progress, allowOvershoot = true) => {
        const travelDistance =
          -cardAnimation.startInset + (cardAnimation.lineLength + cardAnimation.startInset) * progress;
        const point =
          travelDistance < 0
            ? {
                x: cardAnimation.bookPoint.x + cardAnimation.normalizedStartTangent.x * travelDistance,
                y: cardAnimation.bookPoint.y + cardAnimation.normalizedStartTangent.y * travelDistance,
              }
            : cardAnimation.line.getPointAtLength(
                cardAnimation.reversePath
                  ? Math.max(0, cardAnimation.lineLength - Math.min(travelDistance, cardAnimation.lineLength))
                  : Math.min(travelDistance, cardAnimation.lineLength)
              );
        const overshootProgress = allowOvershoot ? Math.max(0, (progress - 0.94) / 0.06) : 0;
        const overshootDistance = allowOvershoot
          ? cardAnimation.overshootDistance * Math.sin(overshootProgress * Math.PI * 0.5)
          : 0;

        return {
          x: point.x + cardAnimation.cardOffset.x + cardAnimation.normalizedTangent.x * overshootDistance,
          y: point.y + cardAnimation.cardOffset.y + cardAnimation.normalizedTangent.y * overshootDistance,
        };
      };
      const setLineProgress = (cardAnimation, progress) => {
        if (!cardAnimation.lineMaskPath) {
          return;
        }

        const visibleLength = Math.max(0, Math.min(cardAnimation.lineLength, cardAnimation.lineLength * progress));

        cardAnimation.lineMaskPath.setAttribute(
          "stroke-dasharray",
          `${visibleLength.toFixed(3)} ${(cardAnimation.lineLength + 24).toFixed(3)}`
        );
        cardAnimation.lineMaskPath.setAttribute(
          "stroke-dashoffset",
          cardAnimation.reversePath ? `${(-cardAnimation.lineLength + visibleLength).toFixed(3)}` : "0"
        );
      };
      const setCardPose = (cardAnimation, x, y, rotation, scale) => {
        gsap.set(cardAnimation.card, {
          x: x - cardAnimation.cardCenter.x,
          y: y - cardAnimation.cardCenter.y,
          rotation,
          scale,
        });
      };
      const renderCardAlongLine = (
        cardAnimation,
        progress,
        rotationFrom,
        rotationTo,
        scaleFrom,
        scaleTo,
        allowOvershoot = true
      ) => {
        const point = sampleLinePoint(cardAnimation, progress, allowOvershoot);
        const travelDistance =
          -cardAnimation.startInset + (cardAnimation.lineLength + cardAnimation.startInset) * progress;
        const lineProgress = Math.max(
          0,
          Math.min(1, (travelDistance - cardAnimation.lineLagDistance) / cardAnimation.lineLength)
        );

        setCardPose(
          cardAnimation,
          point.x,
          point.y,
          gsap.utils.interpolate(rotationFrom, rotationTo, progress),
          gsap.utils.interpolate(scaleFrom, scaleTo, progress)
        );
        setLineProgress(cardAnimation, lineProgress);
      };
      const buildFloatTimeline = (cardAnimation, totalDuration, options = {}) => {
        const floatTimeline = gsap.timeline();
        const amplitudeScale = options.amplitudeScale ?? 1;
        const rotationScale = options.rotationScale ?? 1;
        const amplitudes = [
          cardAnimation.floatAmplitude * amplitudeScale,
          cardAnimation.floatAmplitude * 0.72 * amplitudeScale,
        ];
        const durationScale = options.durationScale ?? 1;
        const settleAtEnd = options.settleAtEnd ?? true;
        let elapsed = 0;
        let segmentIndex = 0;
        let direction = options.initialDirection ?? -1;

        while (elapsed < totalDuration - 0.001) {
          const segmentDuration = Math.min(
            cardAnimation.floatDurations[segmentIndex % cardAnimation.floatDurations.length] * durationScale,
            totalDuration - elapsed
          );
          const isLastSegment = elapsed + segmentDuration >= totalDuration - 0.001;
          const shouldSettle = settleAtEnd && isLastSegment;
          const targetY = shouldSettle ? 0 : direction * amplitudes[segmentIndex % amplitudes.length];
          const targetRotation = shouldSettle ? 0 : direction * cardAnimation.floatRotation * rotationScale;

          floatTimeline.to(cardAnimation.card, {
            y: targetY,
            rotation: targetRotation,
            duration: segmentDuration,
            ease: "sine.inOut",
          });

          elapsed += segmentDuration;
          segmentIndex += 1;
          direction *= -1;
        }

        return floatTimeline;
      };

      let returnStart = sequenceStart;
      let allCardsReturnedTime = sequenceStart;

      cardAnimations.forEach((cardAnimation, index) => {
        cardAnimation.scaledReturnDuration = cardAnimation.returnDuration * cardTravelDurationScale;
        cardAnimation.returnStart = returnStart;
        cardAnimation.returnEnd = returnStart + cardAnimation.scaledReturnDuration;
        allCardsReturnedTime = Math.max(allCardsReturnedTime, cardAnimation.returnEnd);
        returnStart +=
          cardAnimation.scaledReturnDuration +
          (index < cardAnimations.length - 1 ? cardAnimation.returnGap : 0);
      });

      cardAnimations.forEach((cardAnimation, index) => {
        tl.add(
          buildFloatTimeline(cardAnimation, Math.max(0.2, cardAnimation.returnStart - 0.04), {
            amplitudeScale: 0.42,
            rotationScale: 0.65,
            durationScale: 0.42,
            settleAtEnd: false,
            initialDirection: index % 2 === 0 ? -1 : 1,
          }),
          0
        );
      });

      let outStart = allCardsReturnedTime + postAllReturnHold;
      let allCardsOutTime = outStart;

      cardAnimations.forEach((cardAnimation, index) => {
        cardAnimation.scaledOutDuration = cardAnimation.scaledReturnDuration;
        cardAnimation.outStart = outStart;
        cardAnimation.outEnd = outStart + cardAnimation.scaledOutDuration;
        cardAnimation.floatStart = cardAnimation.outEnd;
        allCardsOutTime = Math.max(allCardsOutTime, cardAnimation.outEnd);
        outStart += index < cardAnimations.length - 1 ? cardAnimation.outGap : 0;
      });

      const cycleEnd = allCardsOutTime + postAllOutHold;

      cardAnimations.forEach((cardAnimation) => {
        cardAnimation.floatDuration = Math.max(0.2, cycleEnd - cardAnimation.floatStart);
      });

      cardAnimations.forEach((cardAnimation) => {
        const cardOutMotion = { progress: 0 };
        const cardReturnMotion = { progress: 0 };

        tl.to(
          cardReturnMotion,
          {
            progress: 1,
            duration: cardAnimation.scaledReturnDuration,
            ease: "power2.in",
            onStart: () => {
              cardReturnMotion.progress = 0;
              gsap.set(cardAnimation.card, {
                visibility: "visible",
              });
              const point = sampleLinePoint(cardAnimation, 1, false);

              setCardPose(cardAnimation, point.x, point.y, 0, 1);
              setLineProgress(cardAnimation, 1);
            },
            onUpdate: () => {
              const reverseProgress = 1 - cardReturnMotion.progress;
              const point = sampleLinePoint(cardAnimation, reverseProgress, false);
              const travelDistance =
                -cardAnimation.startInset +
                (cardAnimation.lineLength + cardAnimation.startInset) * reverseProgress;
              const lineProgress = Math.max(
                0,
                Math.min(1, (travelDistance - cardAnimation.lineLagDistance) / cardAnimation.lineLength)
              );

              setCardPose(
                cardAnimation,
                point.x,
                point.y,
                gsap.utils.interpolate(0, cardAnimation.returnRotation, cardReturnMotion.progress),
                gsap.utils.interpolate(1, cardAnimation.returnScale, cardReturnMotion.progress)
              );
              setLineProgress(cardAnimation, lineProgress);
            },
            onComplete: () => {
              gsap.set(cardAnimation.card, {
                visibility: "hidden",
              });
              setLineProgress(cardAnimation, 0);
            },
          },
          cardAnimation.returnStart
        );

        tl.to(
          cardOutMotion,
          {
            progress: 1,
            duration: cardAnimation.scaledOutDuration,
            ease: "power1.out",
            onStart: () => {
              cardOutMotion.progress = 0;
              gsap.set(cardAnimation.card, {
                visibility: "visible",
              });
              setCardPose(
                cardAnimation,
                cardAnimation.cardStart.x,
                cardAnimation.cardStart.y,
                cardAnimation.startRotation,
                cardAnimation.startScale
              );
              setLineProgress(cardAnimation, 0);
            },
            onUpdate: () => {
              renderCardAlongLine(
                cardAnimation,
                cardOutMotion.progress,
                cardAnimation.startRotation,
                cardAnimation.endRotation,
                cardAnimation.startScale,
                1
              );
            },
          },
          cardAnimation.outStart
        );

        tl.add(
          buildFloatTimeline(cardAnimation, cardAnimation.floatDuration, {
            durationScale: 0.48,
          }),
          cardAnimation.floatStart
        );
      });

      tl.to({}, { duration: postAllOutHold }, allCardsOutTime);
    }

    const rightFlipMotion = { flip: 0 };
    const drawRightFlip = () => {
      const flip = rightFlipMotion.flip;
      const arc = Math.sin(flip * Math.PI);
      const move = (from, to) => from + (to - from) * flip;
      const fixedX = (value) => (value + xOffset).toFixed(3);
      const fixedY = (value) => (value + yOffset).toFixed(3);
      const mixX = (from, to) => move(from + xOffset, to + xOffset).toFixed(3);
      const mixY = (from, to) => move(from + yOffset, to + yOffset).toFixed(3);
      const liftY = (from, to, lift = 0) =>
        (move(from + yOffset, to + yOffset) - arc * lift).toFixed(3);
      const main = pageRightFlipParts[0];

      if (!main) {
        return;
      }

      pageRightFlip.style.opacity = 1 - arc * 0.42;

      main.setAttribute(
        "d",
        `M${mixX(510.5, 214)} ${liftY(94.1842, 12.184, 42)}C${mixX(466.9, 262.167)} ${liftY(84.5842, 9.851, 36)} ${mixX(422, 367.8)} ${liftY(109.851, 28.784, 24)} ${fixedX(405)} ${fixedY(123.684)}L${mixX(275, 295)} ${mixY(242.184, 223.684)}L${mixX(235, 234.5)} ${mixY(284.184, 284.684)}C${mixX(307, 212.5)} ${mixY(220.684, 257.851)} ${mixX(453, 190.5)} ${mixY(323.184, 231.017)} ${mixX(459, 168.5)} ${mixY(326.684, 204.184)}C${mixX(463.8, 154)} ${mixY(329.484, 199)} ${mixX(468.333, 168.5)} ${mixY(326.851, 204.184)} ${mixX(470, 168.5)} ${mixY(325.184, 204.184)}L${mixX(653.5, 31.5)} ${liftY(146.684, 166.184, 60)}C${mixX(624, 92.333)} ${liftY(133.184, 114.851, 48)} ${mixX(554.1, 153.167)} ${liftY(103.784, 63.517, 36)} ${mixX(510.5, 214)} ${liftY(94.1842, 12.184, 42)}Z`
      );

      pageRightFlipParts.slice(1).forEach((part) => {
        part.style.opacity = Math.max(0, 1 - flip * 4);
      });
    };

    const rightFlipTl = gsap.timeline({
      repeat: -1,
      repeatDelay: Math.max(0, tl.duration() - 0.26),
      delay: 5.25,
    });

    rightFlipTl
      .set(pageRightFlip, {
        opacity: 1,
      })
      .set(rightFlipMotion, {
        flip: 0,
        onComplete: drawRightFlip,
      })
      .to(rightFlipMotion, {
        flip: 1,
        duration: 0.18,
        ease: "sine.inOut",
        onUpdate: drawRightFlip,
      })
      .to(pageRightFlip, {
        opacity: 0,
        duration: 0.08,
        ease: "sine.inOut",
      });
    });
  };

  heroObject.addEventListener("load", runAnimation);

  if (heroObject.contentDocument) {
    runAnimation();
  }

  return () => {
    heroObject.removeEventListener("load", runAnimation);
    context?.revert();
  };
}
