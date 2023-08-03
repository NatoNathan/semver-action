import { debug, exportVariable, info, setOutput } from "@actions/core";
import github from "@actions/github";
import { parser, toConventionalChangelogFormat } from "@conventional-commits/parser";
import semver from "semver";
import _ from "lodash";


type Tag = {
  name: string;
  target: {
    oid: string;
  };
};
export type Version = string;
export type bumpValues = 'major' | 'minor' | 'patch';

const bumpValues = {
  major: 0,
  minor: 1,
  patch: 2,
  none: 3,
} as const;
/**
 * Bump the version based on the bump type and pre-release stage
 * @param version The current version
 * @param bump The bump type
 * @param preReleaseStage The pre-release stage
 * @returns The bumped version
 */
export const bumpVersion = (version: Version, bump: bumpValues, preReleaseStage: string) =>
  preReleaseStage === "none"
    ? semver.inc(version, bump)
    : semver.inc(version, `pre${bump}`, preReleaseStage);

const removePreRelease = (version: Version) => semver.prerelease(version) ? version.split('-')[0] : version;

/**
 * Get the next version based on the bump type, pre-release stage and minimum change
 *
 * If the minimum change is not met, the version will not be bumped and preReleaseStage is not none a pre-release of the same version will be created
 * If minimumChange is met, the version will be bumped, and the preReleaseStage will be followed as normal
 *
 * @param version The current version
 * @param bump The bump type
 * @param preReleaseStage The pre-release stage
 * @param minimumChange The minimum change
 */
export const getNextVersion = (version: Version, bump: bumpValues, preReleaseStage: string, minimumChange: bumpValues | 'none') => {
  const cleanVersion = semver.clean(version)!;
  // if bump is less then minimum change, then it has higher priority
  if (bumpValues[bump] < bumpValues[minimumChange])
    return bumpVersion(cleanVersion, bump, preReleaseStage);

  // if bump is greater then minimum change, then no version bump is required
  // if preReleaseStage is none, return the current version with any pre-release stripped and no version bump
  return preReleaseStage === "none"
    ? removePreRelease(cleanVersion)
    : semver.inc(cleanVersion, "prerelease", preReleaseStage);

};

export type bumpTypes = {
  major: string[];
  minor: string[];
  patch: string[];
  patchAll: boolean;
};

export const parseCommit = (bumpTypes: bumpTypes, commitMessage: string, commitSha = "unknown") => {
  const ast = parser(commitMessage);
  debug(`Parsed commit ${commitSha} as ${JSON.stringify(ast)}`);
  const cAst = toConventionalChangelogFormat(ast);
  debug(`Converted commit ${commitSha} to ${JSON.stringify(cAst)}`);
  if (cAst.notes.some((note) => note.title === "BREAKING CHANGE")) {
    info(
      `[MAJOR] Commit ${commitSha} has a BREAKING CHANGE mention, causing a major version bump.`
    );
    return "major";
  }
  if (bumpTypes.major.includes(cAst.type)) {
    info(
      `[MAJOR] Commit ${commitSha} of type ${cAst.type} will cause a major version bump.`
    );
    return "major";
  }
  if (bumpTypes.minor.includes(cAst.type)) {
    info(
      `[MINOR] Commit ${commitSha} of type ${cAst.type} will cause a minor version bump.`
    );
    return "minor";
  }
  if (bumpTypes.patchAll || bumpTypes.patch.includes(cAst.type)) {
    info(
      `[PATCH] Commit ${commitSha} of type ${cAst.type} will cause a patch version bump.`
    );
    return "patch";
  }
  info(
    `[SKIP] Commit ${commitSha} of type ${cAst.type} will not cause any version bump.`
  );

  return null;
};

export const outputVersion = (version: string, prefix: string = '') => {
  exportVariable("next", `${prefix}v${version}`);
  exportVariable("nextStrict", `${prefix}${version}`);

  setOutput("next", `${prefix}v${version}`);
  setOutput("nextStrict", `${prefix}${version}`);
  setOutput("nextMajor", `${prefix}v${semver.major(version)}`);
  setOutput("nextMajorStrict", `${prefix}${semver.major(version)}`);
}

export const getLatestTag = async (gh: ReturnType<typeof github.getOctokit>, owner: string, repo: string, skipInvalidTags: boolean, prefix: string): Promise<Tag> => {
  const tagsRaw = await gh.graphql(
    `
      query lastTags ($owner: String!, $repo: String!) {
        repository (owner: $owner, name: $repo) {
          refs(first: 10, refPrefix: "refs/tags/", orderBy: { field: TAG_COMMIT_DATE, direction: DESC }) {
            nodes {
              name
              target {
                oid
              }
            }
          }
        }
      }
    `,
    {
      owner,
      repo,
    }
  );

  const tagsList: Tag[] = _.get(tagsRaw, "repository.refs.nodes", []);

  if (tagsList.length < 1) throw new Error("No tags found!");

  // strip prefix from tags
  const tags = tagsList
    .map((tag) => {
      if (prefix && tag.name.indexOf(prefix) === 0) tag.name = tag.name.replace(prefix, "");
      return tag;
    })
    .filter((tag) => semver.valid(tag.name));
  // .reduce((acc: Tag | null, tag: Tag, index: number) => {
  //   if (!skipInvalidTags && index === 0) return tag;

  // }, null);
  if (!tags) throw new Error("No valid tags found!");

  if (!skipInvalidTags) return tags[0];

  const tag = tags.find((tag) => semver.valid(tag.name));
  if (!tag) throw new Error("No valid tags found!");
  return tag;
}

export const getSpecificTag = async (gh: ReturnType<typeof github.getOctokit>, owner: string, repo: string, tag: string, prefix: string): Promise<Tag> => {
  const tagRaw = await gh.graphql(
    `
      query singleTag ($owner: String!, $repo: String!, $tag: String!) {
        repository (owner: $owner, name: $repo) {
          ref(qualifiedName: $tag) {
            name
            target {
              oid
            }
          }
        }
      }
    `,
    {
      owner,
      repo,
      tag: `refs/tags/${prefix}${tag}`,
    }
  );

  const latestTag: Tag = _.get(tagRaw, "repository.ref") as unknown as Tag;

  if (!latestTag) throw new Error("No tag found!");
  if (prefix && latestTag.name.indexOf(prefix) === 0) latestTag.name = latestTag.name.replace(prefix, "");
  if (!semver.valid(latestTag.name)) throw new Error("No valid tag found!");

  return latestTag;
};
