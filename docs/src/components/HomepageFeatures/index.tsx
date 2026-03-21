import type { ReactNode } from "react";
import clsx from "clsx";
import Heading from "@theme/Heading";
import styles from "./styles.module.css";

type FeatureItem = {
  title: string;
  img: string;
  description: ReactNode;
};

const FeatureList: FeatureItem[] = [
  {
    title: "Welcome to TRIP documentation",
    img: "/trip/img/TRIP_192.png",
    description: (
      <>
        Minimalist <b>POI Map Tracker</b> and <b>Trip Planner</b>. Self-hosted.
      </>
    ),
  },
];

function Feature({ title, img, description }: FeatureItem) {
  return (
    <div className={clsx("col")}>
      <div className="text--center padding-horiz--md">
        <Heading as="h2">{title}</Heading>
      </div>
      <div className="text--center">
        <img role="img" src={img} className="selectDisable" draggable="false" />
      </div>
      <div className="text--center">
        <p>{description}</p>
      </div>
    </div>
  );
}

export default function HomepageFeatures(): ReactNode {
  return (
    <section className={styles.features}>
      <div className="container">
        <div className="row">
          {FeatureList.map((props, idx) => (
            <Feature key={idx} {...props} />
          ))}
        </div>
      </div>
    </section>
  );
}
