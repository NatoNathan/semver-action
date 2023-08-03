import * as github from "@actions/github";
import * as  core from "@actions/core"
import _ from "lodash";
import semver from "semver";
import { bumpTypes, bumpValues, getLatestTag, getNextVersion, getSpecificTag, outputVersion, parseCommit } from "./utils";

async function main() {
  const token = core.getInput("token");
  const branch = core.getInput("branch");
  const gh = github.getOctokit(token);
  const owner = github.context.repo.owner;
  const repo = github.context.repo.repo;
  const skipInvalidTags = core.getBooleanInput("skipInvalidTags");
  const noVersionBumpBehavior = core.getInput("noVersionBumpBehavior");
  const squashMergeCommitMessage = core.getInput("squashMergeCommitMessage");
  const preReleaseStage = core.getInput("preReleaseStage") || "none";
  const prefix = core.getInput("prefix") || "";
  const additionalCommits = core
    .getInput("additionalCommits")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l !== "");
  const fromTag = core.getInput("fromTag");
  const minimumChange = core.getInput("minimumChange") as bumpValues | 'none';

  core.debug(
    `Parsed additional commits as ${JSON.stringify(additionalCommits)}`
  );

  const bumpTypes = {
    major: core
      .getInput("majorList")
      .split(",")
      .map((p) => p.trim())
      .filter((p) => p),
    minor: core
      .getInput("minorList")
      .split(",")
      .map((p) => p.trim())
      .filter((p) => p),
    patch: core
      .getInput("patchList")
      .split(",")
      .map((p) => p.trim())
      .filter((p) => p),
    patchAll: core.getBooleanInput("patchAll"),
  } satisfies bumpTypes;
  try {

    const latestTag = !fromTag ?
      await getLatestTag(gh, owner, repo, skipInvalidTags, prefix) :
      await getSpecificTag(gh, owner, repo, fromTag, prefix);

    core.info(`Latest tag is ${prefix}${latestTag.name}`);

    // OUTPUT CURRENT VARS
    core.exportVariable("current", `${prefix}${latestTag.name}`);
    core.setOutput("current", `${prefix}${latestTag.name}`);

    // GET COMMITS
    const commits: any[] = [];

    let curPage = 0;
    let totalCommits = 0;
    let hasMoreCommits = false;
    do {
      hasMoreCommits = false;
      curPage++;
      const commitsRaw = await gh.rest.repos.compareCommitsWithBasehead({
        owner,
        repo,
        basehead: `${latestTag.name}...${branch}`,
        page: curPage,
        per_page: 100,
      });
      totalCommits = _.get(commitsRaw, "data.total_commits", 0);
      const rangeCommits = _.get(commitsRaw, "data.commits", []);
      commits.push(...rangeCommits);
      if ((curPage - 1) * 100 + rangeCommits.length < totalCommits) {
        hasMoreCommits = true;
      }
    } while (hasMoreCommits);

    if (additionalCommits && additionalCommits.length > 0) {
      commits.push(...additionalCommits);
    }

    if ((!commits || commits.length < 1) && !squashMergeCommitMessage) {
      return core.setFailed(
        "Couldn't find any commits between HEAD and latest tag."
      );
    }

    // PARSE COMMITS
    core.info(`Found ${commits.length} commits between HEAD and latest tag.`);

    const getChanges = (commits: any[]) => {
      const changes = commits.map((commit) => {
        const commitMessage = commit?.commit?.message ?? commit;
        const commitSha = commit?.sha ?? "unknown";
        try {
          core.debug(`Parsing commit ${commitSha} (${commitMessage})`);
          return parseCommit(bumpTypes, commitMessage, commitSha,);
        } catch (err) {
          core.warning(
            `[INVALID] Skipping commit ${commitSha} (${commitMessage}) as it doesn't follow conventional commit format.`
          );
          core.debug(err as string);
          return null;
        }
      });
      return changes;
    }

    const changes = !squashMergeCommitMessage ? getChanges(commits) : getChanges([squashMergeCommitMessage]);

    const bump = changes.reduce((acc, cur) => {
      if (cur === "major" || acc === "major") return "major";
      if (cur === "minor" || acc === "minor") return "minor";
      if (cur === "patch" || acc === "patch") return "patch";
      return acc;
    }, bumpTypes.patchAll ? "patch" : null);

    if (!bump) {
      switch (noVersionBumpBehavior) {
        case "current": {
          core.info(
            "No commit resulted in a version bump since last release! Exiting with current as next version..."
          );
          const next = latestTag.name;
          outputVersion(semver.clean(latestTag.name)!, prefix);
          return;
        }
        case "silent": {
          return core.info(
            "No commit resulted in a version bump since last release! Exiting silently..."
          );
        }
        case "warn": {
          return core.warning(
            "No commit resulted in a version bump since last release!"
          );
        }
        default: {
          return core.setFailed(
            "No commit resulted in a version bump since last release!"
          );
        }
      }
    }
    core.setOutput("versionType", bump);
    core.info(`Bump type is ${bump}`);
    core.info(`Pre-release stage is ${preReleaseStage}`);

    // BUMP VERSION
    const next = getNextVersion(
      latestTag.name,
      bump,
      preReleaseStage,
      minimumChange
    );

    core.info(`Current version is ${prefix}${latestTag.name}`);
    core.info(`Next version is ${prefix}v${next}`);

    outputVersion(next!, prefix);
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message);

    core.setFailed("Failed to bump version");
  }
}

main();
